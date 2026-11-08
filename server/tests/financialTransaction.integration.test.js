const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const mongoose = require("mongoose");
const Product = require("../models/Product");
const Counter = require("../models/Counter");
const Customer = require("../models/Customer");
const Sale = require("../models/Sale");
const LedgerEntry = require("../models/LedgerEntry");
const ReturnRecord = require("../models/ReturnRecord");
const { decrementStock } = require("../services/stockService");
const { allocateReturnItems, computeReturnSettlement } = require("../utils/saleMath");
const { refundCollectionPipeline } = require("../utils/collectionReconciliation");
const { connectIsolatedMongo } = require("./helpers/isolatedMongo");
const {
  executeIdempotently,
  idempotencyIdentity,
  requestFingerprint,
  runFinancialTransaction,
} = require("../services/financialTransaction");

const mongoUri = process.env.FINANCIAL_TEST_MONGO_URI;

test("Mongo transactions roll back failures, prevent concurrent overselling and over-returns, and deduplicate retries", {
  skip: mongoUri ? false : "Set FINANCIAL_TEST_MONGO_URI to an isolated test replica-set database",
}, async (t) => {
  t.after(() => mongoose.disconnect());
  await connectIsolatedMongo(mongoUri, [Product, Counter, Customer, Sale, LedgerEntry, ReturnRecord]);
  const ownerId = new mongoose.Types.ObjectId();
  const fixtureId = new mongoose.Types.ObjectId();
  const customerId = new mongoose.Types.ObjectId();
  const saleId = new mongoose.Types.ObjectId();
  const returnSaleId = new mongoose.Types.ObjectId();
  const requestKey = `financial-test-${crypto.randomUUID()}`;
  const returnKeyA = `return-test-${crypto.randomUUID()}`;
  const returnKeyB = `return-test-${crypto.randomUUID()}`;
  const operation = "financial-transaction-test";
  const idempotencyId = idempotencyIdentity(ownerId, operation, requestKey);
  const returnIdempotencyIds = [
    idempotencyIdentity(ownerId, `sale-return:${returnSaleId}`, returnKeyA),
    idempotencyIdentity(ownerId, `sale-return:${returnSaleId}`, returnKeyB),
  ];
  let fixture;
  let customer;
  let returnSale;

  try {
    fixture = await Product.create({
      _id: fixtureId,
      owner: ownerId,
      name: "Financial test fixture",
      costPrice: 1,
      sellingPrice: 2,
      stock: 8,
      soldCount: 0,
    });
    customer = await Customer.create({
      _id: customerId,
      owner: ownerId,
      name: "Financial test customer",
      phone: `test-${crypto.randomUUID()}`,
    });

    await assert.rejects(
      runFinancialTransaction(async (session) => {
        await decrementStock({
          Product,
          ownerId,
          session,
          items: [{ product: fixture._id, quantity: 3 }],
        });
        customer.pendingBalance = 25;
        await customer.save({ session });
        await Sale.create([{
          _id: saleId,
          owner: ownerId,
          customer: customer._id,
          customerName: customer.name,
          total: 25,
        }], { session });
        await LedgerEntry.create([{
          owner: ownerId,
          customer: customer._id,
          type: "sale",
          amount: 25,
          balanceAfter: 25,
          reference: saleId,
        }, {
          owner: ownerId,
          customer: customer._id,
          type: "payment",
          amount: -10,
          balanceAfter: 15,
          reference: saleId,
        }], { session, ordered: true });
        throw new Error("injected midway failure");
      }),
      /injected midway failure/
    );
    assert.equal((await Product.findById(fixture._id)).stock, 8);
    assert.equal((await Customer.findById(customer._id)).pendingBalance, 0);
    assert.equal(await Sale.exists({ _id: saleId }), null);
    assert.equal(await LedgerEntry.exists({ reference: saleId }), null);

    const failedKey = `rollback-${crypto.randomUUID()}`;
    const failedIdentity = idempotencyIdentity(ownerId, operation, failedKey);
    await assert.rejects(executeIdempotently({
      ownerId, operation, key: failedKey, fingerprint: requestFingerprint(operation, {}, {}),
      work: async (session) => {
        await Product.updateOne({ _id: fixtureId }, { $inc: { stock: -1 } }, { session });
        await Customer.updateOne({ _id: customerId }, { $inc: { pendingBalance: 1 } }, { session });
        throw new Error("forced idempotent failure");
      },
      replay: async () => { throw new Error("must not replay"); },
    }), /forced idempotent failure/);
    assert.equal(await Counter.exists({ _id: failedIdentity }), null);
    assert.equal((await Product.findById(fixtureId)).stock, 8);
    assert.equal((await Customer.findById(customerId)).pendingBalance, 0);

    let attempts = 0;
    await runFinancialTransaction(async (session) => {
      attempts += 1;
      await Product.updateOne({ _id: fixtureId }, { $inc: { stock: 1 } }, { session });
      if (attempts === 1) {
        const error = new mongoose.mongo.MongoServerError({ message: "synthetic transient transaction error" });
        error.addErrorLabel("TransientTransactionError");
        throw error;
      }
    });
    assert.equal(attempts, 2);
    assert.equal((await Product.findById(fixtureId)).stock, 9);
    await Product.updateOne({ _id: fixtureId }, { $set: { stock: 8 } });

    const duplicateKey = `duplicate-${crypto.randomUUID()}`;
    const duplicateIdentity = idempotencyIdentity(ownerId, operation, duplicateKey);
    await assert.rejects(executeIdempotently({
      ownerId, operation, key: duplicateKey, fingerprint: requestFingerprint(operation, {}, {}),
      work: async (session) => {
        await Customer.create([{ owner: ownerId, name: "Duplicate", phone: customer.phone }], { session });
        throw new Error("duplicate index was not enforced");
      },
      replay: async () => { throw new Error("unrelated duplicate must not replay"); },
    }), (error) => error.code === 11000);
    assert.equal(await Counter.exists({ _id: duplicateIdentity }), null);

    await Product.updateOne({ _id: fixture._id }, { $set: { stock: 5 } });
    const concurrentSale = () => runFinancialTransaction((session) => decrementStock({
      Product,
      ownerId,
      session,
      items: [{ product: fixture._id, quantity: 4 }],
    }));
    const stockResults = await Promise.allSettled([concurrentSale(), concurrentSale()]);
    assert.equal(stockResults.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal((await Product.findById(fixture._id)).stock, 1);

    const fingerprint = requestFingerprint(operation, {}, { productId: String(fixture._id) });
    const execute = () => executeIdempotently({
      ownerId,
      operation,
      key: requestKey,
      fingerprint,
      work: async (session) => {
        await Product.updateOne({ _id: fixture._id }, { $inc: { soldCount: 1 } }, { session });
        return { resultType: "sale", resultId: fixture._id, value: "created" };
      },
      replay: async () => "replayed",
    });
    const soldCountBefore = (await Product.findById(fixture._id)).soldCount;
    const idempotentResults = await Promise.all([execute(), execute()]);
    assert.deepEqual(idempotentResults, ["created", "created"]);
    const soldCountAfter = (await Product.findById(fixture._id)).soldCount;
    assert.equal(soldCountAfter - soldCountBefore, 1);

    await assert.rejects(
      executeIdempotently({
        ownerId,
        operation,
        key: requestKey,
        fingerprint: requestFingerprint(operation, {}, { productId: "different" }),
        work: async () => {
          throw new Error("must not run");
        },
        replay: async () => "replayed",
      }),
      (error) => error.status === 409
    );

    returnSale = await Sale.create({
      _id: returnSaleId,
      owner: ownerId,
      customerName: customer.name,
      customerType: "existing",
      total: 10,
      amountPaid: 10,
      dueAmount: 0,
      paymentMethod: "cash",
      paymentStatus: "paid",
      payments: [{ method: "cash", amount: 10, source: "sale" }],
      items: [{
        product: fixture._id,
        name: fixture.name,
        quantity: 1,
        unitPrice: 10,
        subtotal: 10,
        costPrice: 1,
      }],
    });

    const returnFingerprint = requestFingerprint("sale:return", { saleId: String(returnSaleId) }, {
      items: [{ productId: String(fixture._id), quantity: 1 }],
    });
    const concurrentReturn = (key) => executeIdempotently({
      ownerId,
      operation: `sale-return:${returnSaleId}`,
      key,
      fingerprint: returnFingerprint,
      work: async (session) => {
        const sale = await Sale.findOne({ _id: returnSaleId, owner: ownerId }).session(session);
        const allocations = allocateReturnItems(sale, [{ productId: fixture._id, quantity: 1 }]);
        const refund = allocations.reduce((sum, item) => sum + item.refund, 0);
        const settlement = computeReturnSettlement(sale, refund);
        for (const allocation of allocations) allocation.item.returnedQty = allocation.newReturnedQty;
        sale.returnedAmount = settlement.newReturnedAmount;
        sale.payments = settlement.newPayments;
        sale.amountPaid = settlement.newAmountPaid;
        sale.creditApplied = settlement.newCreditApplied;
        sale.dueAmount = settlement.newDueAmount;
        await sale.save({ session });
        await Product.updateOne(
          { _id: fixture._id, owner: ownerId },
          { $inc: { stock: 1, soldCount: -1 } },
          { session }
        );
        const [record] = await ReturnRecord.create([{
          owner: ownerId,
          sale: sale._id,
          type: "return",
          refundAmount: refund,
        }], { session });
        return {
          resultType: "return",
          resultId: record._id,
          relatedResourceId: sale._id,
          value: { refund, returnedQty: sale.items[0].returnedQty },
        };
      },
      replay: async (record) => {
        const returnRecord = await ReturnRecord.findById(record.resultId);
        return { refund: returnRecord.refundAmount, returnedQty: 1 };
      },
    });
    const returnResults = await Promise.allSettled([
      concurrentReturn(returnKeyA),
      concurrentReturn(returnKeyB),
    ]);
    assert.equal(returnResults.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(returnResults.filter((result) => result.status === "rejected").length, 1);
    const returnedSale = await Sale.findById(returnSaleId);
    assert.equal(returnedSale.items[0].returnedQty, 1);
    assert.equal(returnedSale.returnedAmount, 10);
    assert.equal(await ReturnRecord.countDocuments({ sale: returnSaleId }), 1);
    assert.equal((await ReturnRecord.findOne({ sale: returnSaleId })).refundAmount, 10);

    await ReturnRecord.create([
      {
        owner: ownerId,
        sale: returnSaleId,
        cashRefund: 6,
        cashRefundFromCredit: 1,
        cashRefundFromLedger: 2,
        refundPayments: [
          { method: "cash", amount: 3, source: "sale" },
          { method: "upi", amount: 2, source: "ledger" },
          { method: "cash", amount: 1, source: "credit" },
        ],
      },
      {
        owner: ownerId,
        sale: returnSaleId,
        cashRefund: 5,
        cashRefundFromCredit: 3,
        cashRefundFromLedger: 2,
      },
    ]);
    const refundsByMethod = await ReturnRecord.aggregate(refundCollectionPipeline(ownerId, {
      $gte: new Date(Date.now() - 60_000),
    }));
    assert.deepEqual(
      Object.fromEntries(refundsByMethod.map((row) => [row._id, row.amount])),
      { cash: 9, upi: 2 }
    );
    const refundTrend = await ReturnRecord.aggregate(refundCollectionPipeline(
      ownerId,
      { $gte: new Date(Date.now() - 60_000) },
      { trend: true }
    ));
    assert.equal(refundTrend.reduce((sum, row) => sum + row.amount, 0), 11);
  } finally {
    if (fixture) await Product.deleteOne({ _id: fixture._id });
    if (customer) await Customer.deleteOne({ _id: customer._id });
    await Sale.deleteOne({ _id: saleId });
    await Sale.deleteOne({ _id: returnSaleId });
    await LedgerEntry.deleteMany({ reference: saleId });
    await ReturnRecord.deleteMany({ sale: returnSaleId });
    await Counter.deleteOne({ _id: idempotencyId });
    await Counter.deleteMany({ _id: { $in: returnIdempotencyIds } });
    await mongoose.disconnect();
  }
});

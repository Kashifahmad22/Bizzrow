const test = require("node:test");
const assert = require("node:assert");
const {
  allocateBatchQuantities,
  addStockBatch,
  distributeBatchAllocations,
  loadProductBatches,
  makeBatchCode,
  returnedBatchAllocations,
  restoreBatchStock,
  summarizeBatchStock,
} = require("../services/stockBatchService");

test("product stock reconciles as batch remaining plus explicit legacy stock", () => {
  assert.deepEqual(summarizeBatchStock(65, [
    { remainingQuantity: 35 },
    { remainingQuantity: 30 },
  ]), {
    stock: 65,
    batchRemaining: 65,
    legacyUnbatchedStock: 0,
    inconsistent: false,
  });
  assert.deepEqual(summarizeBatchStock(20, [{ remainingQuantity: 5 }]), {
    stock: 20,
    batchRemaining: 5,
    legacyUnbatchedStock: 15,
    inconsistent: false,
  });
  assert.equal(summarizeBatchStock(5, [{ remainingQuantity: 6 }]).inconsistent, true);
  assert.equal(summarizeBatchStock(12, []).legacyUnbatchedStock, 12);
});

test("FIFO allocations use the earliest available batches and leave excess as legacy stock", () => {
  const result = allocateBatchQuantities([
    { _id: "batch-1", remainingQuantity: 35, costPrice: 250 },
    { _id: "batch-2", remainingQuantity: 30, costPrice: 270 },
  ], 40);
  assert.deepEqual(result, {
    allocations: [
      { batch: "batch-1", quantity: 35, costPrice: 250 },
      { batch: "batch-2", quantity: 5, costPrice: 270 },
    ],
    legacyQuantity: 0,
  });
  assert.deepEqual(allocateBatchQuantities([{ _id: "batch-1", remainingQuantity: 5, costPrice: null }], 8), {
    allocations: [{ batch: "batch-1", quantity: 5, costPrice: null }],
    legacyQuantity: 3,
  });
});

test("batch allocations are distributed across duplicate sale lines and returned in original order", () => {
  const items = [
    { product: "p1", quantity: 2 },
    { product: "p1", quantity: 3 },
  ];
  distributeBatchAllocations(items, new Map([["p1", { legacyQuantity: 0, allocations: [
    { batch: "b1", quantity: 3, costPrice: 250 },
    { batch: "b2", quantity: 1, costPrice: 270 },
  ] }]]));
  assert.deepEqual(items.map((item) => item.batchAllocations), [
    [{ batch: "b1", quantity: 2, costPrice: 250 }],
    [
      { batch: "b1", quantity: 1, costPrice: 250 },
      { batch: "b2", quantity: 1, costPrice: 270 },
    ],
  ]);
  assert.deepEqual(returnedBatchAllocations({
    returnedQty: 1,
    batchAllocations: [
      { batch: "b1", quantity: 2 },
      { batch: "b2", quantity: 1 },
    ],
  }, 2), {
    allocations: [
      { batch: "b1", quantity: 1 },
      { batch: "b2", quantity: 1 },
    ],
    unbatchedQuantity: 0,
  });

});

test("legacy-first allocations survive partial returns across duplicate sale lines", () => {
    const items = [{ product: "p1", quantity: 2 }, { product: "p1", quantity: 4 }];
    distributeBatchAllocations(items, new Map([["p1", {
      legacyQuantity: 3,
      allocations: [{ batch: "b1", quantity: 2 }, { batch: "b2", quantity: 1 }],
    }]]));
    assert.deepEqual(items.map((item) => item.legacyQuantityFirst), [2, 1]);
    assert.deepEqual(items[1].batchAllocations, [{ batch: "b1", quantity: 2 }, { batch: "b2", quantity: 1 }]);
    assert.deepEqual(returnedBatchAllocations({ ...items[1], returnedQty: 0 }, 2), {
      allocations: [{ batch: "b1", quantity: 1 }], unbatchedQuantity: 1,
    });
    assert.deepEqual(returnedBatchAllocations({ ...items[1], returnedQty: 2 }, 2), {
      allocations: [{ batch: "b1", quantity: 1 }, { batch: "b2", quantity: 1 }], unbatchedQuantity: 0,
  });
});

test("batch query is owner-scoped and FIFO-sorted", async () => {
  let filter;
  let sort;
  const query = {
    sort(value) { sort = value; return this; },
    session() { return this; },
    then(resolve) { resolve([]); },
  };
  const StockBatch = { find(value) { filter = value; return query; } };
  await loadProductBatches(StockBatch, "owner-1", "product-1", {});
  assert.deepEqual(filter, { owner: "owner-1", product: "product-1", remainingQuantity: { $gt: 0 } });
  assert.deepEqual(sort, { purchaseDate: 1, createdAt: 1, _id: 1 });
});

test("adding a batch atomically increases aggregate stock by the received quantity", async () => {
  const product = { _id: "product-1", stock: 12 };
  let created;
  let productFilter;
  const query = (value) => ({
    session() { return this; },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  });
  const Product = {
    findOne(filter) {
      assert.deepEqual(filter, { _id: "product-1", owner: "owner-1" });
      return query({ ...product });
    },
    async updateOne(filter, update) {
      productFilter = filter;
      product.stock = update.$set.stock;
      return { modifiedCount: 1 };
    },
  };
  const StockBatch = {
    find: () => query([]),
    findOne: (filter) => query(filter.batchCode === "batch-2" ? null : null),
    async create(docs) {
      created = { ...docs[0], _id: "new-batch" };
      return [created];
    },
  };
  const result = await addStockBatch({
    Product,
    StockBatch,
    ownerId: "owner-1",
    productId: "product-1",
    batch: {
      batchCode: "batch-2",
      purchaseDate: new Date("2026-11-04T00:00:00.000Z"),
      quantityReceived: 30,
      costPrice: 270,
    },
    session: {},
  });
  assert.equal(product.stock, 42);
  assert.equal(result.stock, 42);
  assert.equal(created.remainingQuantity, 30);
  assert.equal(created.owner, "owner-1");
  assert.equal(created.product, "product-1");
  assert.deepEqual(productFilter, { _id: "product-1", owner: "owner-1", stock: 12 });
});

test("batch creation rejects stale product stock updates", async () => {
  const session = { id: "transaction-session" };
  const query = (value) => ({
    session(receivedSession) {
      assert.equal(receivedSession, session);
      return this;
    },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  });
  let batchCreatedWithSession;
  const Product = {
    findOne: () => query({ _id: "product-1", stock: 12 }),
    async updateOne(_filter, _update, options) {
      assert.equal(options.session, session);
      return { modifiedCount: 0 };
    },
  };
  const StockBatch = {
    find: () => query([]),
    findOne: () => query(null),
    async create(_docs, options) {
      batchCreatedWithSession = options.session;
      return [{ _id: "batch-1" }];
    },
  };

  await assert.rejects(
    addStockBatch({
      Product,
      StockBatch,
      ownerId: "owner-1",
      productId: "product-1",
      batch: {
        batchCode: "batch-1",
        purchaseDate: new Date("2026-11-04T00:00:00.000Z"),
        quantityReceived: 30,
        costPrice: 270,
      },
      session,
    }),
    (error) => error.status === 409 && /stock changed/.test(error.message)
  );
  assert.equal(batchCreatedWithSession, session);
});

test("return restoration credits the originating batch without exceeding received quantity", async () => {
  const batch = { _id: "batch-1", owner: "owner-1", product: "product-1", quantityReceived: 10, remainingQuantity: 4 };
  const query = (value) => ({
    session() { return this; },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  });
  const updates = [];
  const StockBatch = {
    findOne: (filter) => query(
      filter.owner === batch.owner && filter.product === batch.product && filter._id === batch._id ? { ...batch } : null
    ),
    async updateOne(filter, update) {
      updates.push(filter);
      batch.remainingQuantity = update.$set.remainingQuantity;
      return { modifiedCount: 1 };
    },
  };
  await restoreBatchStock({
    StockBatch,
    ownerId: "owner-1",
    productId: "product-1",
    allocations: [{ batch: "batch-1", quantity: 3 }],
    session: {},
  });
  assert.equal(batch.remainingQuantity, 7);
  assert.deepEqual(updates[0], {
    _id: "batch-1",
    owner: "owner-1",
    product: "product-1",
    remainingQuantity: 4,
  });
  await assert.rejects(
    restoreBatchStock({
      StockBatch,
      ownerId: "owner-1",
      productId: "product-1",
      allocations: [{ batch: "batch-1", quantity: 4 }],
      session: {},
    }),
    (error) => error.status === 409
  );
});

test("generated batch identifiers include date and a unique suffix", () => {
  const code = makeBatchCode(new Date("2026-11-04T00:00:00.000Z"));
  assert.match(code, /^B-20261104-[A-F0-9]{8}$/);
});

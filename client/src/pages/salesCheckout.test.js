import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;

test("checkout payment render uses the calculated due without unbound references", async () => {
  const source = await readFile(new URL("./Sales.jsx", import.meta.url), "utf8");
  const ast = parse(source, { sourceType: "module", plugins: ["jsx"] });
  let modalFound = false;
  let paymentDueReads = 0;
  const unbound = [];
  traverse(ast, {
    FunctionDeclaration(path) {
      if (path.node.id?.name !== "NewSaleModal") return;
      modalFound = true;
      path.traverse({
        ReferencedIdentifier(reference) {
          if (reference.node.name === "due" && !reference.scope.hasBinding("due")) {
            unbound.push(reference.node.loc.start.line);
          }
        },
        MemberExpression(member) {
          if (member.node.object.type === "Identifier" && member.node.object.name === "payment"
              && !member.node.computed && member.node.property.name === "due") paymentDueReads += 1;
        },
      });

    },
  });
  assert.equal(modalFound, true);
  assert.deepEqual(unbound, []);
  assert.ok(paymentDueReads >= 2);
});

test("checkout submits a reviewed snapshot from the cart and rounds displayed unit prices", async () => {
  const source = await readFile(new URL("./Sales.jsx", import.meta.url), "utf8");
  const ast = parse(source, { sourceType: "module", plugins: ["jsx"] });
  let snapshot;
  traverse(ast, {
    FunctionDeclaration(path) {
      if (path.node.id?.name !== "NewSaleModal") return;
      path.traverse({
        ObjectProperty(property) {
          if (property.node.key.name === "reviewedItems") snapshot = property.node.value;
        },
      });
    },
  });
  assert.equal(snapshot?.type, "CallExpression");
  assert.equal(snapshot.callee.object.name, "items");
  assert.equal(snapshot.callee.property.name, "map");
  const mapper = snapshot.arguments[0];
  assert.equal(mapper.type, "ArrowFunctionExpression");
  const fields = Object.fromEntries(mapper.body.properties.map((property) => [property.key.name, property.value]));
  assert.equal(fields.productId.object.name, mapper.params[0].name);
  assert.equal(fields.productId.property.name, "productId");
  assert.equal(fields.quantity.object.name, mapper.params[0].name);
  assert.equal(fields.quantity.property.name, "quantity");
  assert.equal(fields.unitPrice.callee.name, "round2");
  assert.equal(fields.unitPrice.arguments[0].object.name, mapper.params[0].name);
  assert.equal(fields.unitPrice.arguments[0].property.name, "unitPrice");
});

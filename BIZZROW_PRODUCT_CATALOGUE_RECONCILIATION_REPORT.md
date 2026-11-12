# Bizzrow Product Catalogue Reconciliation Report

## Scope and safety

This is an investigation-only report based on the checked-out application code. No production database connection was available in this workspace: `server/config/db.js` requires `MONGO_URI`, and no Mongo/database environment variable was present in the investigation process. No production API or database query was executed. No database document was created, updated, deleted, merged, or migrated.

The counts and duplicate-group totals quoted below were supplied in the task and are **not independently verified**. Production document-level duplicate details, reference counts, and merge mappings therefore remain undetermined. Do not use this report as authorization to change production data.

## Investigation findings

### Product count discrepancy

`GET /api/products` in `server/routes/products.js` builds its filter from:

- `owner: req.user._id`
- An optional text search across `name`, `sku`, `barcode`, `category`, `brand`, `color`, and `size`
- Optional `status` and `maxQty` stock/sold-count conditions

The handler uses that same `filter` for both `Product.find(filter)` and `Product.countDocuments(filter)`. The default page size is 24, and pagination affects the returned page only; the `total` in the response is the count matching the filter. There is no product aggregation pipeline supplying this catalogue total.

The authentication middleware loads the User identified by the JWT and assigns that document to `req.user`. Product ownership is a required `ObjectId` reference to `User`; the schema has no separate `businessId` or tenant relationship. Business information is embedded on the User document and does not determine product scope.

On the Products page, the subtitle uses `data.total` from the API response. With the reported URL `GET /api/products?page=1&limit=24&sort=newest`, and no other query parameters, the page displays the count of all products owned by the authenticated user in the API's database. It does not display the number of products on page 1. The Products page calls the API directly; the shared product-list cache is used in the Sales page, not this Products page.

**Code-level conclusion:** If both supplied observations were taken at the same time from the same database, and the API token resolved to owner `6a1d735e8b199d599469920f`, the API total would use the same `owner` scope as the MongoDB owner-filtered count. A response total of 378 cannot be explained by this route's pagination. It indicates that at least one observation used a different authenticated user ID, database/deployment, data snapshot, or additional filter, or that the reported figures/response were not captured from the same context. The available evidence does not distinguish among these possibilities.

**Production counts by business:** Not verified. The reported collection total of 489, owner-filtered count of 83, and UI/API total of 378 remain user-supplied observations. No counts for other owners/businesses can be responsibly reported without an authorized read-only production connection and verified API identity.

### Duplicate indicators and existing review UI

The `/api/products/duplicates` endpoint loads products scoped to `req.user._id` and passes them to `server/utils/productDuplicates.js`. The current detector creates candidate pairs when they share an SKU, barcode, or normalized name plus size and colour. It does **not** require matching category, cost price, selling price, GST rate, or other meaningful attributes. It reports pairs rather than consolidated duplicate groups.

The existing Review Duplicates UI shows some product identifiers, stock, price fields and the detector's matching reason. It does not show owner/business IDs, GST, image availability, creation dates, sold count, related-reference counts, or batch/audit evidence. It does not merge products; it lets the user choose a record to keep and request deletion of the other. The deletion endpoint rejects products with remaining stock or references in sales, return items, stock batches, or stock adjustments.

Accordingly, the current UI is a **candidate finder**, not a safe reconciliation report or merge workflow. Its "exact duplicate" empty-state wording is stronger than its matching criteria justify.

The task-supplied candidate groups (Kott, three records; Sonam New; British Raj; Parcham; Arpita; Bhasha; Miraka; Khilari; Cheetah; Jasmine; and Palki) and supplied totals (11 name groups/23 documents; stricter grouping 10 groups/20 documents) were not queried or verified. Kott must remain a manual-review group because the supplied observation says its prices differ. No group can be classified as safe to merge from the available evidence.

### Product references discovered in application schemas

The following are direct product-ID references found in the repository's Mongoose schemas:

| Collection/model | Field(s) | Stored relationship / preservation notes |
|---|---|---|
| `sales` (`Sale`) | `items[].product` | ObjectId ref to Product. Sale item name, SKU, unit, size, colour, prices, GST rate, costs, quantities, discounts, totals, and return quantities are historical snapshots and must remain unchanged. `items[].batchAllocations[].batch` separately references StockBatch. |
| `stockbatches` (`StockBatch`) | `product` | ObjectId ref to Product; batch quantities, purchase dates, cost, supplier and purchase reference are inventory history. |
| `stockadjustments` (`StockAdjustment`) | `product`, `batch` | ObjectId refs to Product and StockBatch; before/after stock and source values are audit history. |
| `inventoryaudits` (`InventoryAudit`) | `items[].product`, `items[].sources[].batch`, `items[].sources[].adjustment` | ObjectId refs to Product, StockBatch and StockAdjustment. Audit quantities, revisions and counts are snapshots. |
| `returnrecords` (`ReturnRecord`) | `items[].product`, `quantityReconciliations[].product` | ObjectId refs to Product. `items[].name`, quantity and refund values preserve historical return details. Both product fields must be inspected; the existing deletion guard checks only `items[].product`. |
| `ledgerentries` (`LedgerEntry`) | `reference` | Generic ObjectId with no Product ref. The schema indicates transaction references, not direct product links; do not treat or rewrite these IDs as product IDs. Ledger entries have no product field. |

No separate purchase-record model or direct product reference in the ledger schema was found in the inspected model tree. Batch purchase details are stored on StockBatch. Sales and returns may connect indirectly to batches or ledger entries; those relationships must not be changed as though they were direct product references.

**Safety issue for future work:** The product deletion guard does not check `InventoryAudit.items[].product` or `ReturnRecord.quantityReconciliations[].product`. Thus, "no stock, sales, returns, batches, or adjustments" is not a complete guarantee that no product references remain. No deletion or merge should be attempted until these fields are included in reference checks and the handling of audit snapshots is explicitly determined.

## Proposed production dry-run

No dry-run against production was possible, so there is no product-level JSON/CSV export. Before any merge proposal, run a separately authorized, strictly read-only process that:

1. Connects to the verified production database using read-only credentials and confirms the database and exact owner/user ID without exposing credentials.
2. Counts products by `owner`, and compares the owner-filtered count with the authenticated `/api/products` response from the same deployment and identity.
3. Fetches that owner's candidate products and identifies normalized-name groups, then splits/flags candidates by category, colour, size, cost, selling price, GST and other meaningful metadata.
4. For every candidate product, counts references in all fields listed above, distinguishing direct IDs from historical snapshots and indirect links.
5. Examines StockBatch quantities and corresponding stock adjustments/inventory audits. Flags unreconciled stock, separate physical lots, conflicting prices/metadata, or any reference it cannot safely migrate.
6. Exports owner/business ID, product IDs, proposed canonical candidate, duplicate IDs, attributes, stock, sold count, SKU, image presence, creation dates, per-collection reference counts, conflicts, and a reasoned safe/manual-review status.

No canonical-to-duplicate mapping is proposed in this report because no production records were available to inspect. The user-supplied names are not sufficient to build or approve a mapping.

## Proposed database changes

None at this stage. In particular:

- Do not merge the three Kott records based on name.
- Do not add stock quantities together.
- The selected maximum-stock policy does not by itself reconcile stock batches. If separate remaining quantities represent separate physical stock, or batch stock does not reconcile to product stock, require manual review and do not consolidate.
- Do not alter historical Sale, ReturnRecord, InventoryAudit, StockAdjustment, or LedgerEntry snapshots.
- Do not migrate a product reference without field-specific impact analysis. Do not globally replace ObjectIds.
- Do not delete any record unless every direct reference has been counted and either safely migrated or explicitly prevents deletion.

## Code changes

None. This execution was limited to code/data-flow inspection and this report. The duplicate-review UI and deletion guard were not modified.

## Executed database changes

None. No production connection was available or attempted, no backup was taken, and no production document was changed.

## Tests and verification

Ran isolated tests with:

```text
node --test server/tests/productSearch.test.js server/tests/productDuplicates.test.js server/tests/productDeletion.test.js
```

Result: 17 tests passed, 0 failed. These tests use isolated/mocked data; they do not validate production counts, production duplicate groups, batch integrity for candidate products, reference counts, or a merge/recovery workflow. No application code was changed, and no production data was used.

## Required next evidence and approval gate

To complete the data-specific report, provide an authorized read-only production connection or equivalent sanitized exports for the exact database and owner, plus a verified API response and authenticated user ID from the same deployment. Then generate the dry-run export and proposed mapping. Stop for explicit approval of that mapping before any backup or write operation. Production mutation additionally requires a verified full backup and backup-availability check.

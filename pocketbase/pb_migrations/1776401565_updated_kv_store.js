/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3824733124")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE UNIQUE INDEX idx_kv_store_key ON kv_store (\"key\")"
    ]
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3824733124")

  // update collection data
  unmarshal({
    "indexes": []
  }, collection)

  return app.save(collection)
})

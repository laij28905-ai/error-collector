/* Fixed upstream versions and SHA-256; binaries stay out of Git.

   注意：离线包已随仓库发布到 vendor/tesseract/，所以 url 改为同源相对路径。
   - 不再依赖 cdn.jsdelivr.net / tessdata.projectnaptha.com（国内常被限速或不可达）；
   - 首装只走自己的 GitHub Pages，实测 61MB 十几秒装完；
   - sha256 仍然逐个校验，下载内容不对会拒绝入缓存。 */
self.OCR_PACK = {
  "version": "tesseract-5.1.0-data4",
  "files": [
    {
      "path": "./vendor/tesseract/tesseract.min.js",
      "bytes": 66711,
      "sha256": "be397e903f26199d428b528e8d834cdca8064f95c82068fa34ec8c4d34fd9de9",
      "url": "./vendor/tesseract/tesseract.min.js"
    },
    {
      "path": "./vendor/tesseract/worker.min.js",
      "bytes": 123724,
      "sha256": "2bcc88efb897e6a39517a05325b95e15a59e2bae1c74dee3deafb5a56aef846f",
      "url": "./vendor/tesseract/worker.min.js"
    },
    {
      "path": "./vendor/tesseract/core/tesseract-core-lstm.wasm",
      "bytes": 2859424,
      "sha256": "5db58ea4d1bd4256be81e8ae3b4fa226c4625dfba1850b1b3308dbf3700e9929",
      "url": "./vendor/tesseract/core/tesseract-core-lstm.wasm"
    },
    {
      "path": "./vendor/tesseract/core/tesseract-core-lstm.wasm.js",
      "bytes": 3938276,
      "sha256": "50ec33088c93e69135b09917072c1b2c8cb77eb256946f16723cf6a83c7f8e49",
      "url": "./vendor/tesseract/core/tesseract-core-lstm.wasm.js"
    },
    {
      "path": "./vendor/tesseract/core/tesseract-core-simd-lstm.wasm",
      "bytes": 2859709,
      "sha256": "66b601224a0c4a8977bc9d92dd39841189f9ca22cc4122fcd7208cdb0961eeef",
      "url": "./vendor/tesseract/core/tesseract-core-simd-lstm.wasm"
    },
    {
      "path": "./vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js",
      "bytes": 3938656,
      "sha256": "18797eef96bab787636c40b53efaa445cf5ca1c97abd735c4fd8dc3d03652959",
      "url": "./vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js"
    },
    {
      "path": "./vendor/tesseract/core/tesseract-core-simd.wasm",
      "bytes": 3457317,
      "sha256": "baa2f54ef5af43ada4605fd7ae999bde3c6ecc96bfe0d0410b0b4f4a5f9c8b91",
      "url": "./vendor/tesseract/core/tesseract-core-simd.wasm"
    },
    {
      "path": "./vendor/tesseract/core/tesseract-core-simd.wasm.js",
      "bytes": 4735152,
      "sha256": "ec8537b758625825add9e3ec3eb9e10b5fc574fadc681a2da1357050cdc5ed43",
      "url": "./vendor/tesseract/core/tesseract-core-simd.wasm.js"
    },
    {
      "path": "./vendor/tesseract/core/tesseract-core.wasm",
      "bytes": 3457035,
      "sha256": "b47a852b19181ae0999f9d970c368cd351135a320ea978b35bd38602d8bcc0bc",
      "url": "./vendor/tesseract/core/tesseract-core.wasm"
    },
    {
      "path": "./vendor/tesseract/core/tesseract-core.wasm.js",
      "bytes": 4734776,
      "sha256": "fe68f746dc186bb19e2c55de3514d3d6c4036ede53488b5a4db00dfe3f75e5f1",
      "url": "./vendor/tesseract/core/tesseract-core.wasm.js"
    },
    {
      "path": "./vendor/tesseract/lang/chi_sim.traineddata.gz",
      "bytes": 20159757,
      "sha256": "59388039851e4d1293d729c183fd8c1fa9bbbb959eed996e945024671e68c1d6",
      "url": "./vendor/tesseract/lang/chi_sim.traineddata.gz"
    },
    {
      "path": "./vendor/tesseract/lang/eng.traineddata.gz",
      "bytes": 10923060,
      "sha256": "ed350f3752f81ee8f38769edc14d92d997dababe23b565c59879372cc46a2468",
      "url": "./vendor/tesseract/lang/eng.traineddata.gz"
    }
  ]
};
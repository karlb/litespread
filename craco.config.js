module.exports = {
  webpack: {
    configure: {
      resolve: {
        fallback: {
          fs: false,
          path: false,
          crypto: false
        }
      }
    }
  },
  jest: {
    configure: {
      moduleNameMapper: {
        '^sql\\.js$': 'sql.js/dist/sql-asm.js'
      }
    }
  }
};

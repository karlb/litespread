const MIME_TYPE = 'application/x-sqlite3';

var RemoteLitespread = { name: 'litespread', builder: function(privateClient, publicClient) {

  return {
    exports: {

      add: function (filename, data) {
        return privateClient.storeFile(
          MIME_TYPE,
          filename,
          data
          //db.export().buffer
        );
      },

      save: function (filename, data) {
        return privateClient.storeFile(
          MIME_TYPE,
          filename,
          data
        );
      },

      list: function () {
        return privateClient.getListing('')
      },

      getFile: function (filename) {
        return privateClient.getFile(filename);
      },

    }
  }
}};

export default RemoteLitespread;
export {
  MIME_TYPE,
};

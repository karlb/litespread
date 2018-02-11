const MIME_TYPE = 'application/x-sqlite3';

var RemoteLitespread = { name: 'litespread', builder: function(privateClient, publicClient) {

  return {
    exports: {

      // Save as a new file in remote storage. If file already exists,
      // append a disambiguating postfix. Returns the file name.
      add: function (filename, data) {
        // TODO: handling of exisiting files missing!
        console.log(data);
        return privateClient.storeFile(
          MIME_TYPE,
          filename,
          data
        ).then(() => filename);
      },

      save: function (filename, data) {
        return privateClient.storeFile(
          MIME_TYPE,
          filename,
          data
        );
      },

      remove: function (filename) {
        return privateClient.remove(filename);
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

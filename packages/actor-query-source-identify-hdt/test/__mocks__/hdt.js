// Mocked HDT package
let hdtDocument = undefined;
module.exports = {
    __setMockedDocument: function(doc) {
        hdtDocument = doc;
    },
    fromFile: function (file) {
        if (!file) {
            return Promise.reject(new Error('File not found'));
        } else {
            return Promise.resolve(hdtDocument);
        }
    }
};

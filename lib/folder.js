//folder
//external modules
var async = require('async');
var LZString = require('lz-string');
var moment = require('moment');

//core
var config = require("./config.js");
var logger = require("./logger.js");
var response = require("./response.js");
var models = require("./models");

//public
var Folder = {
    moveNote: moveNote
};

function moveNote(req, res) {
    if (req.isAuthenticated()) {
        var noteId = LZString.decompressFromBase64(req.params.noteId);
        var folderId = LZString.decompressFromBase64(req.params.folderId);
        var userId = req.user.id;
        checkFolder(userId, folderId, function (err, folder) {
            if (err) return response.errorInternalError(res);
            if (folder === null) return response.errorNotFound(res);
            if (folder === false) return response.errorForbidden(res);
            moveNoteToFolder(userId, noteId, folderId, function (err, note) {
                if (err) return response.errorInternalError(res);
                if (note === null) return response.errorNotFound(res);
                if (note === false) return response.errorForbidden(res);
                res.end();
            });
        });
    } else {
        return response.errorForbindden(res);
    }
}

function checkFolder(ownerId, folderId, callback) {
    models.Folder.findOne({
        where: {
            id: folderId
        }
    }).then(function (folder) {
        if (!folder) return callback(null, null);
        if (ownerId != folder.ownerId) return callback(null, false);
        return callback(null, true);
    }).catch(function (err) {
        logger.error('check folder failed: ' + err);
        return callback(err, null);
    });
}

function moveNoteToFolder(ownerId, noteId, folderId, callback) {
    models.Note.findOne({
        where: {
            id: noteId
        }
    }).then(function (note) {
        if (!note) return callback(null, null);
        if (ownerId != note.ownerId) return callback(null, false);
        note.update({
            folderId: folderId
        });
        return callback(null, true);
    }).catch(function (err) {
        logger.error('move note to folder failed: ' + err);
        return callback(err, null);
    });
}

module.exports = Folder;

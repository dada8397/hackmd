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
    listNotes: listNotes,
    moveNote: moveNote
};

function moveNote(req, res) {
    if (req.isAuthenticated()) {
        var noteId = LZString.decompressFromBase64(req.params.noteId);
        var folderId = LZString.decompressFromBase64(req.params.folderId);
        var userId = req.user.id;
        checkFolderPermission(userId, folderId, function (err, folder) {
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

function checkFolderPermission(ownerId, folderId, callback) {
    if (folderId === "00000000-0000-0000-0000-000000000000") {
        return callback(null, {
            id: folderId,
            getNotes: function () {
                return models.Note.findAll({
                    where: {
                        $or: [
                            { folderId: null },
                            { folderId: folderId }
                        ]
                    }
                });
            },
            update: function () {
                return new Promise(function(resolve, reject) {
                });
            }
        });
    } else {
        models.Folder.findOne({
            where: {
                id: folderId
            }
        }).then(function (folder) {
            if (!folder) return callback(null, null);
            if (ownerId != folder.ownerId) return callback(null, false);
            return callback(null, folder);
        }).catch(function (err) {
            logger.error('check folder failed: ' + err);
            return callback(err, null);
        });
    }
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

function listNotes(req, res) {
    if (req.isAuthenticated()) {
        var userId = req.user.id;
        var folderId = LZString.decompressFromBase64(req.params.folderId);
        checkFolderPermission(userId, folderId, function (err, folder) {
            if (err) return response.errorInternalError(res);
            if (folder === false) return response.errorForbidden(res);
            if (folder === null) return response.errorNotFound(res);
            getNotes(folder, function (err, notes) {
                if (err) return response.errorInternalError(res);
                res.send({
                    notes: notes
                });
            });
        });
    } else {
        return response.errorForbidden(res);
    }
}

function getNotes(folder, callback) {
    var _note = [];
    folder.getNotes().then(function (notes) {
        notes.forEach(function (note) {
            var noteInfo = models.Note.parseNoteInfo(note.content);
            _note.push({
                id: LZString.compressToBase64(note.id),
                text: note.title,
                time: moment(note.lastchangeAt || note.createdAt).valueOf(),
                tag: noteInfo.tags
            });
        });
        if (config.debug)
            logger.info('read notes success: ' + folderId);
        return callback(null, _note);
    }).catch(function (err) {
        logger.error('read notes failed: ' + err);
        return callback(err, null);
    });
}

module.exports = Folder;

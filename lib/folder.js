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
    listAllFolders: listAllFolders,
    searchKeyword: searchKeyword,
    deleteFolder: deleteFolder,
    moveFolder: moveFolder,
    newFolder: newFolder,
    listNotes: listNotes,
    moveNote: moveNote,
    newNote: newNote,
    rename: rename
};

function newNote(req, res) {
    if (req.isAuthenticated()) {
        var userId = req.user.id;
        var folderId = LZString.decompressFromBase64(req.params.folderId);
        checkFolderPermission(userId, folderId, function (err, folder) {
            if (err) return response.errorInternalError(res);
            if (folder === false) return response.errorForbidden(res);
            if (folder === null) return response.errorNotFound(res);
            newNoteInFolder(userId, folder, function (err, note) {
                if (err) return response.errorInternalError(res);
                res.send({
                    note: {
                        id: LZString.compressToBase64(note.id)
                    }
                });
            });
        });
    } else {
        return response.errorForbidden(res);
    }
}

function newNoteInFolder(ownerId, folder, callback) {
    models.Note.create({
        ownerId: ownerId,
        folderId: folder.id
    }).then(function (note) {
        return callback(null, note);
    }).catch(function (err) {
        logger.error('create note in folder failed: ' + err);
        return callback(err, null);
    });
}

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

function rename(req, res) {
    if (req.isAuthenticated()) {
        var userId = req.user.id;
        var folderId = LZString.decompressFromBase64(req.params.folderId);
        var folderName = req.params.folderName;
        checkFolderPermission(userId, folderId, function (err, folder) {
            if (err) return response.errorInternalError(res);
            if (folder === false) return response.errorForbidden(res);
            if (folder === null) return response.errorNotFound(res);
            setName(folder, folderName, function (err, folder) {
                if (err) return response.errorInternalError(res);
                res.end();
            });
        });
    } else {
        return response.errorForbindden(res);
    }
}

function setName(folder, folderName, callback) {
    folder.update({
        name: folderName
    }).then(function (affectedFolders) {
        return callback(null, true);
    }).catch(function (err) {
        logger.error('set folder name failed: ' + err);
        return callback(err, null);
    });
}

function searchKeyword(req, res) {
    if (req.isAuthenticated()) {
        var keyword = req.params.keyword;
        var userId = req.user.id;
        noteSearch(keyword, userId, function (err, notes) {
            if (err) return response.errorInternalError(res);
            folderSearch(keyword, userId, function (err, folders) {
                if (err) return response.errorInternalError(res);
                res.send({
                    notes: notes,
                    folders: folders
                });
            });
        });
    } else {
        return response.errorForbindden(res);
    }
}

function noteSearch(keyword, userId, callback) {
    models.Note.findAll({
        where: {
            ownerId: userId,
            content: {
                $like: '%' + keyword + '%'
            }
        }
    }).then(function (notes) {
        var _notes = [];
        notes.forEach(function (note) {
            var noteInfo = models.Note.parseNoteInfo(note.content);
            _notes.push({
                id: LZString.compressToBase64(note.id),
                text: note.title,
                time: moment(note.lastchangeAt || note.createdAt).valueOf(),
                tag: noteInfo.tags
            });
        });
        if (config.debug)
            logger.info('keyword for notes searching success: ' + keyword);
        return callback(null, _notes);
    }).catch(function (err) {
        logger.error('keyword for notes searching failed: ' + err);
        return callback(err, null);
    });
}

function folderSearch(keyword, userId, callback) {
    models.Folder.findAll({
        where: {
            ownerId: userId,
            name: {
                $like: '%' + keyword + '%'
            }
        }
    }).then(function (folders) {
        var _folders = [];
        folders.forEach(function (folder) {
            _folders.push({
                id: LZString.compressToBase64(folder.id),
                text: folder.name,
                time: moment(folder.createdAt).valueOf()
            });
        });
        if (config.debug)
            logger.info('keyword for folders searching success: ' + keyword);
        return callback(null, _folders);
    }).catch(function (err) {
        logger.error('keyword for folders searching failed: ' + err);
        return callback(err, null);
    });
}

function getFolders(ownerId, callback) {
    models.Folder.findAll({
        where: {
            ownerId: ownerId
        }
    }).then(function (folders) {
        var _folders = [];
        folders.forEach(function (folder) {
            _folders.push({
                id: LZString.compressToBase64(folder.id),
                text: folder.name,
                time: moment(folder.createAt).valueOf(),
                parentId: LZString.compressToBase64(folder.parentId)
            });
        });
        var folderList = [];
        var lookup = {};
        _folders.forEach(function (_folder) {
            lookup[_folder.id] = _folder;
        });
        _folders.forEach(function (_folder) {
            if (_folder.parentId !==
                LZString.compressToBase64("00000000-0000-0000-0000-000000000000")) {
                    if (!lookup[_folder.parentId].nodes) lookup[_folder.parentId].nodes = [];
                    lookup[_folder.parentId].nodes.push(_folder);
            } else {
                folderList.push(_folder);
            }
        });
        if (config.debug)
            logger.info('read folder success: ' + ownerId);
        return callback(null, folderList);
    }).catch(function (err) {
        logger.error('read folder fail: ' + err);
        return callback(err, null);
    });
}

function listAllFolders(req, res) {
    var userId = null;
    if (req.isAuthenticated()) {
        userId = req.user.id;
        getFolders(userId, function (err, folders) {
            if (err) return response.errorInternalError(res);
            res.send({
                folders: folders
            });
        });
    } else {
        return response.errorForbidden(res);
    }
}

function newFolder(req, res) {
    var owner = null;
    if (req.isAuthenticated()) {
        owner = req.user.id;
        var parentId = LZString.decompressFromBase64(req.params.parentId);
        var folderName = req.params.folderName;
        checkFolderPermission(owner, parentId, function (err, parentFolder) {
            if (err) return response.errorInternalError(res);
            if (parentFolder === false) return response.errorForbidden(res);
            if (parentFolder === null) return response.errorNotFound(res);
            if (folderName === null) return response.errorBadRequest(res);

            models.Folder.create({
                ownerId: owner,
                name: folderName,
                parentId: parentId
            }).then(function (folder) {
                res.send({
                    id: LZString.compressToBase64(folder.id),
                    text: folder.name,
                    time: moment(folder.createAt).valueOf()
                });
                if (config.debug) logger.info('create folder success'); 
            }).catch(function (err) {
                logger.error('create folder failed' + err);
                return response.errorInternalError(res);
            });
        });
    } else { 
        return response.errorForbidden(res);
    }
}

function deleteFolder(req, res) {
    if (req.isAuthenticated()) {
        var userId = req.user.id;
        var folderId = LZString.decompressFromBase64(req.params.folderId);
        checkFolderPermission(userId, folderId, function (err, folder) {
            if (err) return response.errorInternalError(res);
            if (folder === false) return response.errorForbidden(res);
            if (folder === null) return response.errorNotFound(res);
            deleteFolderRecursive(userId, folderId, function (err) {
                if (err) return response.errorInternalError(res);
                folder.destroy();
                res.end();
            });
        });
    } else {
        return response.errorForbidden(res);
    }
}

function deleteFolderRecursive(userId, folderId, callback) {
    models.Note.destroy({
        where: {
            folderId: folderId,
            ownerId: userId
        }
    }).then(function (affectedNotes) {
        if (config.debug)
            logger.info('delete note in folder success: ' + folderId);
        return callback(null);
    }).catch(function (err) {
        logger.error('delete note fail: ' + err);
        return callback(err);
    });

    models.Folder.findAll({
        where: {
            parentId: folderId,
            ownerId: userId
        }
    }).then(function (folders) {
        if (!folders) return callback(null);
        folders.forEach(function (folder) {
            if (folder) {
                deleteFolderRecursive(userId, folder.id, function (err) {
                    if (err) return callback(err);
                });
                folder.destroy();
            }
        });
        if (config.debug)
            logger.info('delete folder in folder success: ' + folderId);
        return callback(null);
    }).catch(function (err) {
        logger.error('delete folder fail: ' + err);
        return callback(err);
    });
}

function moveFolder(req, res) {
    var owner = null;
    if (req.isAuthenticated()) {
        owner = req.user.id;
        var folderId = LZString.decompressFromBase64(req.params.folderId);
        var newParentId = LZString.decompressFromBase64(req.params.newParentId);

        checkFolderPermission(owner, newParentId, function (err, newParent) {
            if (err) return response.errorInternalError(res);
            if (newParent === false) return response.errorForbidden(res);
            if (newParent === null) return response.errorNotFound(res);
            
            checkFolderPermission(owner, folderId, function (err, folder) {
                if (err) return response.errorInternalError(res);
                if (folder === false) return response.errorForbidden(res);
                if (folder === null) return response.errorNotFound(res);

                folder.update({
                    parentId : newParentId
                }).then(function (folder) {
                    res.send({
                        id: LZString.compressToBase64(folder.id),
                        text: folder.name,
                        time: moment(folder.createAt).valueOf()
                    });
                    if (config.debug) logger.info('move folder success ' + owner + ' ' + folderName);
                }).catch(function (err) {
                    logger.error('move folder failed ' + err);
                    return response.errorInternalError(res);
                });
            });
        });
    } else {
        return response.errorForbidden(res);
    }
}

module.exports = Folder;

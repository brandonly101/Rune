/*
 * TaskController controls anything related to task management
*/

var User = require('../models/user.js');
var Project = require('../models/project.js');

var Helper = require('../models/helpers.js');

var async = require('async');
var request = require('request');


module.exports = function(app, passport) {

    // Task creation is handled through a front-end pop-up modal.
    app.get('/p/:projectid/createtask/', Helper.isLoggedIn, Helper.doesProjectExist, Helper.isUserProjectMember, Helper.isAjaxRequest, function(req, res) {

        Helper.getProjectMemberList(req.params.projectid, function(err, userList) {
            if (err) throw err;

            res.render('includes/task/create.jade', {
                // These are navbar variables
                loggedIn : req.isAuthenticated(),
                projList : req.user.local.projects,
                firstname : req.user.local.firstname,

                usersList : userList,
                statuses : app.locals.statuses
            });

        });

    });

    // Task creation POST request.
    app.post('/p/:projectid/createtask', Helper.isLoggedIn, Helper.doesProjectExist, Helper.isUserProjectMember, function(req, res) {
        // We want to create a new Task object (see models/task.js)
        // To see how mongoose creates and saves objects, see app.post('/createproject') endpoint
        // make sure the current logged in user (saved under req.user.local) is the "reporter" of the task
        // Make sure the project key (e.g. JIRA) is appended to the task ID (so our task ID is called JIRA-649 for example)
        Project.findById(req.params.projectid, function(err, foundProj) {
            if (err) {
                throw err;
            } else {
                foundProj.counter++;
                var taskID = foundProj.projectkey + '-' + Helper.zeroPad(foundProj.counter, 3);
                foundProj.tasks.push({
                    projectid       :   req.params.projectid,
                    taskname        :   req.body.taskname,
                    taskid          :   taskID,
                    taskdescription :   req.body.taskdescription,
                    createdby       :   req.user.local.firstname + ' ' + req.user.local.lastname,
                    assignedto      :   req.body.assignedto,
                    status          :   req.body.status,
                    datecreated     :   new Date().toDateString(),
                    priority        :   req.body.priority,
                    issuetype       :   req.body.issuetype
                });

                foundProj.history.push({
                    date : new Date().toDateString(),
                    link : taskID,
                    action : req.user.local.firstname + ' ' + req.user.local.lastname + ' created new task',
                    description : 'and assigned to ' + req.body.assignedto
                });

                foundProj.save(function(err) {
                    res.redirect('/p/' + req.params.projectid + '/');
                });
            }
        });
    });

    // A Task page GET request.
    app.get('/p/:projectid/t/:taskid/', Helper.isLoggedIn, Helper.doesProjectExist, Helper.isUserProjectMember, function(req, res) {
        async.waterfall([
            function findProject(callback) {
                Project.findById(req.params.projectid, function(err, foundProj) {
                    if (err) {
                        callback(err);
                    } else {
                        callback(null, foundProj);
                    }
                });
            },
            function searchForTask(foundProj, callback) {
                var taskList = foundProj.tasks;
                for (var i = 0; i < taskList.length; i++) {
                    if (taskList[i].taskid == req.params.taskid) {
                        var foundTask = taskList[i];
                        return callback(null, foundProj, foundTask);
                    }
                }
                callback(1);
            },
            function getUsersList(foundProj, foundTask, callback) {
                Helper.getProjectMemberList(req.params.projectid, function(err,usersList) {
                    if (err) {
                        callback(err);
                    } else {
                        callback(null, foundProj, foundTask, usersList);
                    }
                });
            },
            function getGitHubCommits(foundProj, foundTask, usersList, callback) {
                var commitList;
                var options = {
                    url : 'https://api.github.com/repos/' + foundProj.github_owner + '/' + foundProj.github_repo + '/commits?client_id=fb79527a871e5ba8f0f7&client_secret=a82aa7f700c3f1022aefa81abdf77cf590593098',
                    headers : {
                        'User-Agent': 'request'
                    }
                }
                request(options, function(err,response,body){
                    if (response.statusCode != 200) {
                        console.log('something weird happened.');
                        callback(null, foundProj, foundTask, usersList, null);

                    } else {
                        commitList = JSON.parse(body);
                        callback(null, foundProj, foundTask, usersList, commitList);
                    }

                });
            }
        ],
        function(err, foundProj, foundTask, usersList, commitList) {
            if (err) {
                res.send('error');
            } else {
                foundProj.save(function(err2, done) {
                    if (err2) {
                        throw err2;
                    } else {
                        var taskRender = (!req.xhr) ? 'task.jade' : 'includes/task/task.jade';
                        console.log(commitList);
                        res.render(taskRender, {
                            // These are navbar variables
                            loggedIn : req.isAuthenticated(),
                            isAjax : req.xhr,

                            // Project information.
                            projKey : foundProj.projectkey,
                            projName : foundProj.projectname,
                            projId : foundProj.projectid,
                            projList : req.user.local.projects,
                            firstname : req.user.local.firstname,
                            isProjectPage : false,

                            github_repo : foundProj.github_repo,
                            github_owner : foundProj.github_owner,
                            commits : commitList,

                            // Task information.
                            taskid : req.params.taskid,
                            taskname : foundTask.taskname,
                            taskdescription : foundTask.taskdescription,
                            statuses : app.locals.statuses,
                            usersList : usersList,
                            curAssignee : foundTask.assignedto,
                            curStatus : foundTask.status,
                            completed : (foundTask.status == "Completed") ? true : false,
                            archived : (foundTask.status == "Archived") ? true : false,
                            curPriority : foundTask.priority,
                            comments : foundTask.comments
                        });
                    }
                });
            }
        }); // end async waterfall
    }); // end app.get

    // Task edit AJAX GET request.
    app.get('/p/:projectid/t/:taskid/edit/', Helper.isLoggedIn, Helper.doesProjectExist,
            Helper.isUserProjectMember, Helper.isAjaxRequest, function(req, res) {
        async.waterfall([
            function findProject(callback) {
                Project.findById(req.params.projectid, function(err, foundProj) {
                    if (err) {
                        callback(err);
                    } else {
                        callback(null, foundProj);
                    }
                });
            },
            function searchForTask(foundProj, callback) {
                var taskList = foundProj.tasks;
                for (var i = 0; i < taskList.length; i++) {
                    //console.log(taskList[i].taskid + ' ' + req.params.taskid)
                    if (taskList[i].taskid == req.params.taskid) {
                        var foundTask = taskList[i];
                        console.log('found task');
                        return callback(null, foundProj, foundTask);
                    }
                }
                console.log('1. couldn\'t find task');
                callback(1);
            },
            function getUsersList(foundProj, foundTask, callback) {
                Helper.getProjectMemberList(req.params.projectid, function(err,usersList) {
                    if (err) {
                        callback(err);
                    } else {
                        callback(null, foundProj, foundTask, usersList);
                    }
                });
            }
        ],
        function(err, foundProj, foundTask, usersList) {
            if (err) {
                if (err == 1) {
                    console.log('2. couldn\'t find task');
                }
                res.send('error');
            } else {
                //foundTask.status = app.locals.statuses[req.params.status];
                foundProj.save(function(err2,done) {
                    if (err2) {
                        throw err2;
                    } else {
                        console.log('=====\n\n');
                        //Helper.getProjectMemberList(req.params.projectid);
                        console.log(foundTask.assignedto);
                        res.render('includes/task/edit.jade', {
                            // These are navbar variables
                            loggedIn : req.isAuthenticated(),
                            projList : req.user.local.projects,
                            firstname : req.user.local.firstname,
                            taskname : foundTask.taskname,
                            taskdescription : foundTask.taskdescription,
                            statuses : app.locals.statuses,
                            usersList : usersList,
                            curAssignee : foundTask.assignedto,
                            curStatus : foundTask.status,
                            curPriority : foundTask.priority
                        });
                    }
                });
            }
        }); // end async waterfall
    }); // end app.get

    // A task-edit AJAX POST request.
    app.post('/p/:projectid/t/:taskid/edit/', Helper.isLoggedIn, Helper.doesProjectExist, Helper.isUserProjectMember, function(req, res){
        async.waterfall([
            function findProject(callback) {
                Project.findById(req.params.projectid, function(err, foundProj) {
                    if (err) {
                        callback(err);
                    } else {
                        callback(null, foundProj);
                    }
                });
            },
            function searchForTask(foundProj, callback) {
                var taskList = foundProj.tasks;
                for (var i = 0; i < taskList.length; i++) {
                    //console.log(taskList[i].taskid + ' ' + req.params.taskid)
                    if (taskList[i].taskid == req.params.taskid) {
                        var foundTask = taskList[i];
                        console.log('found task');
                        return callback(null, foundProj, taskList, i);
                    }
                }
                console.log('1. couldn\'t find task');
                callback(1);
            },
            function editTask(foundProj, taskList, index, callback) {
                console.log(req.body);

                if (taskList[index].status != req.body.status) {
                    foundProj.history.push({
                        date : new Date().toDateString(),
                        link : taskList[index].taskid,
                        action : req.user.local.firstname + ' ' + req.user.local.lastname + ' moved',
                        description : 'from [ ' + taskList[index].status + ' ] to [ ' + req.body.status + ' ]'
                    });
                }

                taskList[index].taskname = req.body.taskname;
                taskList[index].taskdescription = req.body.taskdescription;
                taskList[index].status = req.body.status;
                taskList[index].assignedto = req.body.assignedto;
                taskList[index].priority = req.body.priority;

                // save this updated project
                foundProj.save(function(err2,done) {
                    if (err2) {
                        throw err2;
                    } else {
                        console.log('task modified and project updated');
                        //res.redirect('/p/' + req.params.projectid + '/');
                        callback(null, 'done');
                    }
                });
            }
        ], function(err, foundProj, taskList, index) {
            if (err) {
                if (err == 1) {
                    console.log('2. couldn\'t find task');
                }
                res.send('error');
            } else {
                res.redirect('/p/' + req.params.projectid + '/');
                //res.redirect('/');
            }
        }); // end async waterfall
    }); // end edit


    // A Task archive AJAX POST request.
    app.post('/p/:projectid/t/:taskid/archive/', Helper.isLoggedIn, Helper.doesProjectExist, Helper.isUserProjectMember, function(req, res) {
        async.waterfall([
            function findProject(callback) {
                Project.findById(req.params.projectid, function(err, foundProj) {
                    if (err) {
                        callback(err);
                    } else {
                        callback(null, foundProj);
                    }
                });
            },
            function searchForTask(foundProj, callback) {
                var taskList = foundProj.tasks;
                for (var i = 0; i < taskList.length; i++) {
                    //console.log(taskList[i].taskid + ' ' + req.params.taskid)
                    if (taskList[i].taskid == req.params.taskid) {
                        var foundTask = taskList[i];
                        console.log('found task');
                        return callback(null, foundProj, taskList, i);
                    }
                }
                console.log('1. couldn\'t find task');
                callback(1);
            },
            function archiveTask(foundProj, taskList, index, callback) {
                console.log(taskList[index]);
                taskList[index].status = "Archived";
                foundProj.history.push({
                    date : new Date().toDateString(),
                    link : taskList[index].taskid,
                    action : req.user.local.firstname + ' ' + req.user.local.lastname + ' archived'
                });
                // save this updated project
                foundProj.save(function(err2,done) {
                    if (err2) {
                        throw err2;
                    } else {
                        console.log('task archived');
                        //res.redirect('/p/' + req.params.projectid + '/');
                        callback(null, 'done');
                    }
                });
            }
        ], function(err, foundProj, taskList, index) {
            if (err) {
                if (err == 1) {
                    console.log('2. couldn\'t find task');
                }
                res.send('error');
            } else {
                res.redirect('/p/' + req.params.projectid + '/');
            }
        }); // end async waterfall
    }); // end delete task


    // A Task unarchive AJAX POST request.
    app.post('/p/:projectid/t/:taskid/unarchive/', Helper.isLoggedIn, Helper.doesProjectExist, Helper.isUserProjectMember, function(req, res) {
        async.waterfall([
            function findProject(callback) {
                Project.findById(req.params.projectid, function(err, foundProj) {
                    if (err) {
                        callback(err);
                    } else {
                        callback(null, foundProj);
                    }
                });
            },
            function searchForTask(foundProj, callback) {
                var taskList = foundProj.tasks;
                for (var i = 0; i < taskList.length; i++) {
                    //console.log(taskList[i].taskid + ' ' + req.params.taskid)
                    if (taskList[i].taskid == req.params.taskid) {
                        var foundTask = taskList[i];
                        console.log('found task');
                        return callback(null, foundProj, taskList, i);
                    }
                }
                console.log('1. couldn\'t find task');
                callback(1);
            },
            function unarchiveTask(foundProj, taskList, index, callback) {
                console.log(taskList[index]);
                taskList[index].status = "Completed";
                foundProj.history.push({
                    date : new Date().toDateString(),
                    link : taskList[index].taskid,
                    action : req.user.local.firstname + ' ' + req.user.local.lastname + ' unarchived'
                });
                // save this updated project
                foundProj.save(function(err2,done) {
                    if (err2) {
                        throw err2;
                    } else {
                        console.log('task unarchived');
                        //res.redirect('/p/' + req.params.projectid + '/');
                        callback(null, 'done');
                    }
                });
            }
        ], function(err, foundProj, taskList, index) {
            if (err) {
                if (err == 1) {
                    console.log('2. couldn\'t find task');
                }
                res.send('error');
            } else {
                res.redirect('/p/' + req.params.projectid + '/');
            }
        }); // end async waterfall
    }); // end delete task


    // A Task delete AJAX POST request.
    app.post('/p/:projectid/t/:taskid/delete/', Helper.isLoggedIn, Helper.doesProjectExist, Helper.isUserProjectMember, function(req, res) {
        async.waterfall([
            function findProject(callback) {
                Project.findById(req.params.projectid, function(err, foundProj) {
                    if (err) {
                        callback(err);
                    } else {
                        callback(null, foundProj);
                    }
                });
            },
            function searchForTask(foundProj, callback) {
                var taskList = foundProj.tasks;
                for (var i = 0; i < taskList.length; i++) {
                    //console.log(taskList[i].taskid + ' ' + req.params.taskid)
                    if (taskList[i].taskid == req.params.taskid) {
                        var foundTask = taskList[i];
                        console.log('found task');
                        return callback(null, foundProj, taskList, i);
                    }
                }
                console.log('1. couldn\'t find task');
                callback(1);
            },
            function deleteTask(foundProj, taskList, index, callback) {
                foundProj.history.push({
                    date : new Date().toDateString(),
                    action : req.user.local.firstname + ' ' + req.user.local.lastname + ' deleted ' + taskList[index].taskid + ': ' +  taskList[index].taskdescription,
                });


                taskList.splice(index,1);
                // save this updated project

                foundProj.save(function(err2,done) {
                    if (err2) {
                        throw err2;
                    } else {
                        console.log('task deleted and project updated');
                        //res.redirect('/p/' + req.params.projectid + '/');
                        callback(null, 'done');
                    }
                });
            }
        ], function(err, foundProj, taskList, index) {
            if (err) {
                if (err == 1) {
                    console.log('2. couldn\'t find task');
                }
                res.send('error');
            } else {
                res.redirect('/p/' + req.params.projectid + '/');
            }
        }); // end async waterfall
    }); // end delete task

    // A task-move AJAX request.
    app.post('/p/:projectid/movetask/', Helper.isLoggedIn, Helper.doesProjectExist,
            Helper.isUserProjectMember, Helper.isAjaxRequest, function(req, res) {
        async.waterfall([
            function findProject(callback) {
                Project.findById(req.params.projectid, function(err, foundProj) {
                    if (err) {
                        callback(err);
                    } else {
                        callback(null, foundProj);
                    }
                });
            },
            function searchForTask(foundProj, callback) {
                var taskList = foundProj.tasks;
                for (var i = 0; i < taskList.length; i++) {
                    if (taskList[i].taskid == req.body.taskid) {
                        var foundTask = taskList[i];
                        return callback(null, foundProj, taskList, i);
                    }
                }
                callback(1);
            },
            function moveTask(foundProj, taskList, index, callback) {
                // Update the task's status and save it the project state.

                if (taskList[index].status != req.body.status) {
                    foundProj.history.push({
                        date : new Date().toDateString(),
                        link : taskList[index].taskid,
                        action : req.user.local.firstname + ' ' + req.user.local.lastname + ' moved',
                        description : 'from [ ' + taskList[index].status + ' ] to [ ' + req.body.status + ' ]'
                    });
                }

                taskList[index].status = req.body.status;
                foundProj.save(function(err2, done) {
                    if (err2) {
                        throw err2;
                    } else {
                        callback(null, 'done');
                    }
                });
            }
        ], function(err, foundProj, taskList, index) {
            if (err) {
                res.send('error');
            } else {
                res.redirect('/p/' + req.params.projectid + '/');
            }
        }); // end async waterfall
    }); // end movetask


    app.post('/p/:projectid/t/:taskid/comment/', Helper.isLoggedIn, Helper.doesProjectExist, Helper.isUserProjectMember, function(req, res){
        async.waterfall([
            function findProject(callback) {
                Project.findById(req.params.projectid, function(err, foundProj) {
                    if (err) {
                        callback(err);
                    } else {
                        callback(null, foundProj);
                    }
                });
            },
            function searchForTask(foundProj, callback) {
                var taskList = foundProj.tasks;
                for (var i = 0; i < taskList.length; i++) {
                    //console.log(taskList[i].taskid + ' ' + req.params.taskid)
                    if (taskList[i].taskid == req.params.taskid) {
                        var foundTask = taskList[i];
                        console.log('found task');
                        return callback(null, foundProj, taskList, i);
                    }
                }
                console.log('1. couldn\'t find task');
                callback(1);
            },
            function addComment(foundProj, taskList, index, callback) {
                console.log(req.body);

                taskList[index].comments.push({
                    date : new Date().toDateString(),
                    authorid : req.user.local.userid,
                    authorname : req.user.local.firstname + ' ' + req.user.local.lastname,
                    comment : req.body.comment,
                    github : req.body.githubcommit
                });

                // save this updated project
                foundProj.save(function(err2,done) {
                    if (err2) {
                        throw err2;
                    } else {
                        console.log('task modified and project updated');
                        //res.redirect('/p/' + req.params.projectid + '/');
                        callback(null, 'done');
                    }
                });


            }
        ], function(err, foundProj, taskList, index) {
            if (err) {
                if (err == 1) {
                    console.log('2. couldn\'t find task');
                }
                res.send('error');
            } else {
                res.redirect('/p/' + req.params.projectid + '/t/' + req.params.taskid);
                //res.redirect('/');
            }
        }); // end async waterfall
    }); // end edit

} // End of module exports

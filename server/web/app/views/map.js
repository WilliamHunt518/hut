_.provide("App.Views.Map");
_.provide("App.Views.SubMap");

var labels = [];
var agentRoutes = {};
var count = 3;
var ros = null;
var connected = false;
var api = new $.provStoreApi({username: 'atomicorchid', key: '2ce8131697d4edfcb22e701e78d72f512a94d310'});
var ps = PostService();

App.Views.Map = Backbone.View.extend({
    ModeEnum: {
        PAN: 'pan',
        ADD_WAYPOINT_TASK: 'add_waypoint_task',
        ADD_MONITOR_TASK: 'add_monitor_task',
        ADD_PATROL_TASK: 'add_patrol_task',
        ADD_REGION_TASK: 'add_region_task',
        ADD_AGENT: 'add_agent'
    },
    MarkerColourEnum: {
        RED: {'h': 0, 's': 1, 'l': 1, 'name':'red'},
        BLUE: {'h': 240, 's': 3, 'l': 0.8, 'name':'blue'},
        GREEN: {'h': 120, 's': 1, 'l': 1, 'name':'green'},
        ORANGE: {'h': 39, 's': 0.8, 'l': 1.2, 'name':'orange'}
    },
    initialize: function (options) {
        var self = this;

        this.state = options.state;
        this.views = options.views;

        MapController.bind(this);
        MapAgentController.bind(this);
        MapTaskController.bind(this);
        MapHazardController.bind(this);
        MapTargetController.bind(this);

        this.mapOptions = {
            zoom: 18,
            center: new google.maps.LatLng(50.939025, -1.461583),
            mapTypeId: google.maps.MapTypeId.HYBRID,
            overviewMapControl: false,
            streetViewControl: false,
            mapTypeControl: false,
            scaleControl: false,
            scrollwheel: true,
            disableDoubleClickZoom: false,
            disableDefaultUI: true,
        };
        $.extend(this.wOptions, options.mapOptions || {});

        this.icons = {
            UAV: $.loadIcon("icons/used/uav.png", "icons/plane.shadow.png", 30, 30),
            UAVManual: $.loadIcon("icons/used/uav_manual.png", "icons/plane.shadow.png", 30, 30),
            UAVSelected: $.loadIcon("icons/used/uav_selected.png", "icons/plane.shadow.png", 30, 30),
            UAVTimedOut: $.loadIcon("icons/used/uav_timedout.png", "icons/plane.shadow.png", 30, 30),
            Marker: $.loadIcon("icons/used/marker.png", "icons/msmarker.shadow.png", 10, 34),
            MarkerMonitor: $.loadIcon("icons/used/marker_monitor.png", "icons/msmarker.shadow.png", 10, 34),
            TargetHuman: $.loadIcon("icons/used/man.png", "icons/man.shadow.png", 30, 30)
        };

        this.first = true;

        this.render();
        MapController.bindEvents();
        MapAgentController.bindEvents();
        MapTaskController.bindEvents();
        MapHazardController.bindEvents();
        MapTargetController.bindEvents();

        setTimeout(function () {
            self.setupROS();
        }, 800);
    },
    render: function () {
        var self = this;

        setTimeout(function () {
            self.views.clickedAgent = "agent-1";
            /* provenence document submit */
            if (self.state.getProvDoc() == null) {
                ps.initProv(api, 'uav_silver_commander', self.state.getGameId());
            }
        }, 800);

        this.$el.gmap(this.mapOptions);

        //Add components to gmap
        this.$el.gmap("addControl", "game_info", google.maps.ControlPosition.TOP_LEFT);
        this.$el.gmap("addControl", "gmap_menu", google.maps.ControlPosition.TOP_CENTER);
        this.$el.gmap("addControl", "map_buttons_sub", google.maps.ControlPosition.RIGHT_TOP);

        this.map = this.$el.gmap("get", "map");

        this.tooltip = new LatLngTooltip({map: this.map});

        this.bind("refresh", function () {
            self.$el.gmap("refresh");
        });

        this.setupDrawing();
        this.setMode(this.ModeEnum.PAN);
        this.hideForGametype();
    },
    hideForGametype() {
        var type = this.state.getGameType();
        if (type === this.state.GAME_TYPE_SCENARIO)
            $("#sandbox_buttons_sub").hide();
    },
    setupROS: function () {
        var self = this;

        ros = new ROSLIB.Ros();

        // If there is an error on the backend, an 'error' emit will be emitted.
        ros.on('error', function (error) {
            console.log(error);
        });

        // Find out exactly when we made a connection.
        ros.on('connection', function () {
            console.log('Connection made!');
            self.connected = true;
        });

        ros.on('close', function () {
            console.log('Connection closed.');
            self.connected = false;
        });

        // Create a connection to the rosbridge WebSocket server.
        ros.connect('ws://haymarket.ecs.soton.ac.uk:9090');

        this.state.agents.forEach(function (agent) {
            if (agent.attributes.route[0] != null) agentRoutes[agent.id] = agent.attributes.route[0];
            else agentRoutes[agent.id] = 0;
        });
    },
    setMode: function (newMode) {
        //mode_selected is used to change the style of each of the elements to show it is currently selected
        //only one should be selected at each time so unset them all then the code below will only set one.
        $("#pan_mode").removeClass("mode_selected");
        $("#add_agent_mode").removeClass("mode_selected");
        $("#add_waypoint_task_mode").removeClass("mode_selected");
        $("#add_monitor_task_mode").removeClass("mode_selected");
        $("#add_patrol_task_mode").removeClass("mode_selected");
        $("#add_region_task_mode").removeClass("mode_selected");
        //Deselect agent
        this.views.clickedAgent = null;
        var validMode = true;
        switch (newMode) {
            case this.ModeEnum.PAN:
                this.drawing.setDrawingMode(null);
                $("#pan_mode").addClass("mode_selected");
                break;
            case this.ModeEnum.ADD_AGENT:
                this.drawing.setDrawingMode(google.maps.drawing.OverlayType.MARKER);
                $("#add_agent_mode").addClass("mode_selected");
                break;
            case this.ModeEnum.ADD_WAYPOINT_TASK:
                this.drawing.setDrawingMode(google.maps.drawing.OverlayType.MARKER);
                $("#add_waypoint_task_mode").addClass("mode_selected");
                break;
            case this.ModeEnum.ADD_MONITOR_TASK:
                this.drawing.setDrawingMode(google.maps.drawing.OverlayType.MARKER);
                $("#add_monitor_task_mode").addClass("mode_selected");
                break;
            case this.ModeEnum.ADD_PATROL_TASK:
                this.drawing.setDrawingMode(google.maps.drawing.OverlayType.POLYLINE);
                $("#add_patrol_task_mode").addClass("mode_selected");
                break;
            case this.ModeEnum.ADD_REGION_TASK:
                this.drawing.setDrawingMode(google.maps.drawing.OverlayType.RECTANGLE);
                $("#add_region_task_mode").addClass("mode_selected");
                break;
            default:
                validMode = false
        }
        if (validMode)
            this.mapMode = newMode;
        else {
            console.log('Cannot set map view to mode ' + newMode);
            this.mapMode = this.ModeEnum.PAN;
            $("#pan_mode").addClass("mode_selected");
        }
    },
    setupDrawing: function () {
        this.drawing = new google.maps.drawing.DrawingManager({
            drawingControl: false,
            markerOptions: {
                draggable: true,
                raiseOnDrag: true
            },
            polylineOptions: {
                strokeOpacity: 0.8,
                strokeWeight: 5
            },
            map: this.map
        });

        this.polylineIcon = {
            icon: {
                scale: 4,
                path: google.maps.SymbolPath.FORWARD_OPEN_ARROW
            },
            offset: '100%'
        }
    },
    updateRoute: function (agent) {
        //this.updateTable();
        //var self = this;

        // if (this.connected) {
        //     this.state.agents.forEach(function (agent) {
        //         if (agent.attributes.route[0] != null &&
        //             (agentRoutes[agent.id].latitude != agent.attributes.route[0].latitude ||
        //                 agentRoutes[agent.id].longitude != agent.attributes.route[0].longitude)) {
        //             console.log("ROUTE CHANGED");
        //             agentRoutes[agent.id] = agent.attributes.route[0];
        //             self.updateROS(agent);
        //         }
        //     });
        // }
    },

    /***
     * A function to draw the circles for uncertainty.
     * Currently these are of a constant size (proof of concept)
     *      The "radius" value can be imported based on real values live if required, as this is called with each time step
     *      Colour or opacity could also be modulated
     */
    drawUncertainties: function () {
        var self = this;
        this.state.agents.each(function (agent) {
            var agentId = agent.getId();
            var sigma = 10; // Uncertainty radius in metres
            var currentCircle = self.$el.gmap("get", "overlays > Circle", [])[agentId+"_unc"];

            if(currentCircle) {
                currentCircle.setOptions({center: agent.getPosition()});
            } else {

                self.$el.gmap("addShape", "Circle", {
                    id: agentId + "_unc",
                    strokeColor: "#FF0000",
                    strokeOpacity: 0.8,
                    strokeWeight: 0,
                    fillColor: "#0033ff",
                    fillOpacity: 0.4,
                    center: agent.getPosition(),
                    radius: sigma,
                });
            }
        })
    },

    updateAllocationRendering: function () {
        var self = this;
        var mainAllocation = this.state.getAllocation();
        var tempAllocation = this.state.getTempAllocation();
        var droppedAllocation = this.state.getDroppedAllocation();

        //Set all task markers to red
        this.state.tasks.each(function (task) {
            MapTaskController.updateTaskRendering(task.getId(), self.MarkerColourEnum.RED);
        });

        this.state.agents.each(function (agent) {
            var agentId = agent.getId();
            var mainLineId = agentId + "main";
            var tempLineId = agentId + "temp";
            var droppedLineId = agentId + "dropped";

            //Draw or hide 'real' allocation.
            if (agentId in mainAllocation) {
                if (!self.state.isEdit())
                    MapTaskController.updateTaskRendering(mainAllocation[agentId], self.MarkerColourEnum.GREEN);
                if (!agent.isWorking())
                    self.drawAllocation(mainLineId, "green", agentId, mainAllocation[agentId]);
                else
                    self.hidePolyline(mainLineId);
            }
            else
                self.hidePolyline(mainLineId);

            //Draw or hide 'temp' allocation.
            if (self.state.isEdit() && agentId in tempAllocation) {
                MapTaskController.updateTaskRendering(tempAllocation[agentId], self.MarkerColourEnum.ORANGE);
                if((!agent.isWorking() || agent.getAllocatedTaskId() !== tempAllocation[agentId]))
                    self.drawAllocation(tempLineId, "orange", agentId, tempAllocation[agentId]);
            }
            else
                self.hidePolyline(tempLineId);

            //Draw or hide 'dropped' allocation.
            if (self.state.isEdit() && agentId in droppedAllocation)
                self.drawAllocation(droppedLineId, "grey", agentId, droppedAllocation[agentId]);
            else
                self.hidePolyline(droppedLineId);
        });

        //Colour task marker that is being hovered over when manually allocating
        if (MapAgentController.taskIdToAllocateManually)
            MapTaskController.updateTaskRendering(MapAgentController.taskIdToAllocateManually, this.MarkerColourEnum.BLUE);
    },
    drawAllocation: function (lineId, lineColour, agentId, taskId) {
        var self = this;
        var isTempLine = lineId.endsWith('temp');
        var agentMarker = this.$el.gmap("get", "markers")[agentId];
        var agent = this.state.agents.get(agentId);
        var polyline = this.$el.gmap("get", "overlays > Polyline", [])[lineId];

        //Get polyline path
        var path = [agentMarker.getPosition()];
        var route = isTempLine ? agent.getTempRoute() : agent.getRoute();
        var convertedRoute = route.map(function (c) {
            return new google.maps.LatLng(c.latitude, c.longitude);
        });
        path = path.concat(convertedRoute);

        //Alter existing polyline if it exists
        if (polyline) {
            //Only render arrow on the end of the polyline if the last leg is long enough
            var dist = google.maps.geometry.spherical.computeDistanceBetween(path[path.length - 2], path[path.length - 1]);
            var relativeSize = 0.05;
            var bounds = this.map.getBounds();
            var center = this.map.getCenter();
            if (bounds && center) {
                var ne = bounds.getNorthEast();
                var radius = google.maps.geometry.spherical.computeDistanceBetween(center, ne);
            }
            if (dist < relativeSize * radius)
                polyline.setOptions({icons: []});
            else
                polyline.setOptions({icons: [this.polylineIcon]});

            //Show polyline if currently hidden.
            if (!polyline.getMap())
                polyline.setMap(this.map);

            //Update polyline path if path doesn't match. Add listeners here since the path object is overwritten.
            if (!_.doPathsMatch(polyline.getPath(), new google.maps.MVCArray(path))) {
                polyline.setOptions({path: path});
                google.maps.event.addListener(polyline.getPath(), 'insert_at', function (vertex) {
                    MapController.processWaypointChange(agentId, polyline, vertex, true);
                });
                google.maps.event.addListener(polyline.getPath(), 'set_at', function (vertex) {
                    MapController.processWaypointChange(agentId, polyline, vertex, false);
                });
                google.maps.event.addListener(polyline.getPath(), 'remove_at', function (vertex) {
                    MapController.processWaypointDelete(agentId, vertex);
                });
            }
        }
        //If arrow doesn't exist, create it
        else {
            this.$el.gmap("addShape", "Polyline", {
                id: lineId,
                editable: isTempLine,
                icons: [this.polylineIcon],
                strokeOpacity: 0.8,
                strokeColor: lineColour,
                strokeWeight: 5,
                zIndex: isTempLine ? 2 : 1
            });
            //Polyline right click listener for temp lines
            if (isTempLine) {
                polyline = this.$el.gmap("get", "overlays > Polyline", [])[lineId];
                google.maps.event.addListener(polyline, "rightclick", function (event) {
                    if (event.vertex === undefined || event.vertex === 0 || event.vertex === (polyline.getPath().length - 1)) {
                        self.$el.gmap("openInfoWindow", {minWidth: 300}, null, function (iw) {
                            var property = document.createElement("div");
                            property.innerHTML = _.template($("#allocation_edit").html(), {
                                agent_id: agentId,
                                task_id: taskId
                            });
                            iw.setContent(property);
                            iw.setPosition(event.latLng);

                            google.maps.event.addListener(iw, 'domready', function () {
                                $(property).on("click", "#allocation_edit_delete", function () {
                                    $.ajax({
                                        url: "/allocation/" + agentId,
                                        type: 'DELETE'
                                    });
                                    iw.close();
                                });
                            });
                        });
                    }
                    else {
                        self.$el.gmap("openInfoWindow", {minWidth: 300}, null, function (iw) {
                            var property = document.createElement("div");
                            property.innerHTML = _.template($("#waypoint_remove").html(), {});
                            iw.setContent(property);
                            iw.setPosition(event.latLng);

                            $(property).on("click", "#waypoint_remove_button", function () {
                                polyline.getPath().removeAt(event.vertex);
                                iw.close();
                            });
                        });
                    }
                });
            }
        }
    },
    hidePolyline: function (lineId) {
        var polyline = this.$el.gmap("get", "overlays > Polyline", [])[lineId];
        if (polyline)
            polyline.setMap(null);
    },
    updateROS: function (agent) {
        var agentid = agent.id.split("-")[0] + agent.id.split("-")[1];

        // First, we create a Topic object with details of the topic's name and message type.
        var waypoints = new ROSLIB.Topic({
            ros: ros,
            name: '/' + agentid + '/orchid/instructions',
            // name : '/' + agentid + '/queue/instructions',
            messageType: 'mavros/InstructionList'
        });

        var pointList = [];

        for (var i = 0; i < agent.attributes.route.length; ++i) {
            pointList.push({
                type: 3,
                frame: 1,
                waitTime: 1,
                range: 2,
                latitude: agent.attributes.route[i].latitude,
                longitude: agent.attributes.route[i].longitude,
                altitude: agent.attributes.altitude
            });
        }

        if (pointList.length > 0) {
            console.log("MESSAGES CREATED");

            // Then we create the payload to be published. The object we pass in to ros.Message matches the
            // fields defined in the mavros/InstructionList.msg definition.
            var message = new ROSLIB.Message({
                inst: pointList
            });

            console.log(message);

            // And finally, publish
            waypoints.publish(message);
        }
    },
    updateTable: function () {
        var mainAllocation = this.state.getAllocation();
        var tempAllocation = this.state.getTempAllocation();
        var self = this;

        if (this.state.isEdit()) {
            var originalDist = 0;
            var originalTime = 0;
            var newDist = 0;
            var newTime = 0;
            this.state.agents.each(function (agent) {
                var agentId = agent.getId();
                var task, dist, time, endPoint;
                if (agentId in mainAllocation) {
                    task = self.state.tasks.get(mainAllocation[agentId]);
                    if (task && !agent.isWorking() && agent.getRoute().length > 0) {
                        endPoint = agent.getRoute()[agent.getRoute().length - 1];
                        dist = google.maps.geometry.spherical.computeDistanceBetween(agent.getPosition(), _.position(endPoint.latitude, endPoint.longitude));
                        time = dist / agent.getSpeed();
                        originalDist += dist;
                        if (time > originalTime)
                            originalTime = time;
                    }
                }
                if (agentId in tempAllocation) {
                    task = self.state.tasks.get(tempAllocation[agentId]);
                    if (task && !agent.isWorking() && agent.getTempRoute().length > 0) {
                        endPoint = agent.getTempRoute()[agent.getTempRoute().length - 1];
                        dist = google.maps.geometry.spherical.computeDistanceBetween(agent.getPosition(), _.position(endPoint.latitude, endPoint.longitude));
                        time = dist / agent.getSpeed();
                        newDist += dist;
                        if (time > newTime)
                            newTime = time;
                    }
                }
            });
            $("#total_dist_orig").html(parseFloat(originalDist / 1000).toFixed(2) + "km");
            $("#total_dist_new").html(parseFloat(newDist / 1000).toFixed(2) + "km");
            $("#flight_time_orig").html(_.convertToTime(originalTime, false));
            $("#flight_time_new").html(_.convertToTime(newTime, false));
        } else {
            var remainingDist = 0;
            var estimatedRemainingTime = 0;

            this.state.agents.each(function (agent) {
                var agentId = agent.getId();
                var task, dist, time;
                if (agentId in mainAllocation && !agent.isWorking()) {
                    task = self.state.tasks.get(mainAllocation[agentId]);
                    if (task) {
                        var endPoint = agent.getRoute()[agent.getRoute().length - 1];
                        if (endPoint) {
                            dist = google.maps.geometry.spherical.computeDistanceBetween(agent.getPosition(), _.position(endPoint.latitude, endPoint.longitude));
                            time = dist / agent.getSpeed();
                            remainingDist += dist;
                            if (time > estimatedRemainingTime)
                                estimatedRemainingTime = time;
                        }
                    }
                }
            });
            $("#remaining_dist").html(parseFloat(remainingDist / 1000).toFixed(2) + "km");
            $("#remaining_time").html(_.convertToTime(estimatedRemainingTime, false));
        }
    },
    updateClickedAgent: function (agent) {
        this.views.clickedAgent = agent != null ? agent.getId() : "";
        if (agent) {
            this.views.camera.trigger("update");
            this.views.control.trigger("update:agent", agent);
        }
    },
    getIcon: function (num) {
        switch (num) {
            case -1:
                return "icons/redquestion5.png";
            case 0:
                return "icons/water.png";
            case 1:
                return "icons/infra.png";
            case 2:
                return "icons/medical.png";
            case 3:
                return "icons/crime.png";
            case 4:
                return "icons/invalid.png";
        }
    }
});

App.Views.SubMap = Backbone.View.extend({
    initialize: function (options) {
        this.mapOptions = {
            zoom: 19,
            scaleControl: false,
            mapTypeControl: false,
            disableDefaultUI: true,
            overviewMapControl: false,
            mapTypeId: google.maps.MapTypeId.ROADMAP
        };
        $.extend(this.mapOptions, options.mapOptions || {});

        this.icons = {
            UAV: $.loadIcon("icons/plane.png", "icons/plane.shadow.png", 16, 16),
            Human: $.loadIcon("icons/man.png", "icons/man.shadow.png", 16, 16)
        };

        this.state = options.state;
        this.views = options.views;

        this.render();
        this.bindEvents();
    },
    render: function () {
        this.$el.gmap(this.mapOptions);
        this.map = this.$el.gmap("get", "map");


        var self = this;
        this.bind("refresh", function () {
            self.$el.gmap("refresh");

            if (!self.clickedRect) {
                self.clickedRect = new google.maps.Rectangle({
                    strokeOpacity: 0.9,
                    strokeWeight: 0.5,
                    map: self.map
                });
                self.bind("camera:bounds", function (sw, ne) {
                    self.clickedRect.setBounds(new google.maps.LatLngBounds(sw, ne));
                });
            }

            var markers = self.$el.gmap("get", "markers");
            for (var key in markers) {
                var marker = markers[key];
                if (key.match("^agent-")) {
                    if (key === self.views.clickedAgent) {
                        self.map.setCenter(marker.getPosition());
                        self.map.setZoom(19);
                        MapAgentController.updateAgentMarkerIcon(self.state.agents.get(marker.id));
                    } else {
                        marker.setIcon("icons/measle_blue.png");
                        marker.setShadow(null);
                    }
                }
                if (key.match("^task-")) {
                    var model = self.state.tasks.get(key);
                    if ($.inArray(self.views.clickedAgent, model.getAgents()) !== -1) {
                        marker.setIcon(null);
                    } else {
                        marker.setIcon("icons/measle_red.png");
                    }
                }
            }
        });

    },
    bindEvents: function () {
        var markers = this.$el.gmap("get", "markers");
        this.bindAgents(markers);
        this.bindTasks(markers);
    },
    bindAgents: function (markers) {
        var self = this;
        this.state.agents.on("add", function (model, collection, options) {
            var id = model.getId();
            if (id === self.views.clickedAgent) {
                self.$el.gmap("addMarker", {
                    id: id,
                    bounds: false,
                    position: model.getPosition(),
                    heading: model.getHeading(),
                    icon: App.Resources.Icons.UAV.Image,
                    shadow: App.Resources.Icons.UAV.Shadow
                });
                self.map.setCenter(model.getPosition());
                self.map.setZoom(19);
            } else {
                self.$el.gmap("addMarker", {
                    id: id,
                    bounds: false,
                    position: model.getPosition(),
                    heading: model.getHeading(),
                    icon: "icons/measle_blue.png"
                });
            }
        });
        this.state.agents.on("remove", function (model, collection, options) {
            var id = model.getId();
            if (markers[id]) {
                markers[id].setMap(null);
                markers[id] = null;
                delete markers[id];
            }
            model.destroy();
        });
        this.state.agents.on("change", function (model, options) {
            var id = model.getId();
            var marker = markers[id];
            if (id === self.views.clickedAgent) {
                self.map.setCenter(model.getPosition());
                self.map.setZoom(19);
                marker.setIcon(self.icons.UAV.Image);
                marker.setShadow(self.icons.UAV.Shadow);
            } else {
                marker.setIcon("icons/measle_blue.png");
                marker.setShadow(null);
            }
            marker.setPosition(model.getPosition());
        });

    },
    bindTasks: function (markers) {
        var self = this;
        this.state.tasks.on("add", function (model, collection, options) {
            var id = model.getId();
            if ($.inArray(self.views.clickedAgent, model.getAgents()) !== -1) {
                self.$el.gmap("addMarker", {
                    id: id,
                    position: model.getPosition()
                });
            } else {
                self.$el.gmap("addMarker", {
                    id: id,
                    position: model.getPosition(),
                    icon: "icons/measle_red.png"
                });
            }

            self.views.control.trigger("update:tasks");
        });
        this.state.tasks.on("remove", function (model, collection, options) {
            var id = model.getId();
            if (markers[id]) {
                markers[id].setMap(null);
                markers[id] = null;
                delete markers[id];
            }
            model.destroy();
            self.views.control.trigger("update:tasks");
        });
        this.state.tasks.on("change", function (model, options) {
            var id = model.getId();
            var marker = markers[id];
            if ($.inArray(self.views.clickedAgent, model.getAgents()) !== -1) {
                marker.setIcon(null);
            } else {
                marker.setIcon("icons/measle_red.png");
            }
            marker.setPosition(model.getPosition());
        });
    },
});

function rgb(r, g, b) {
    return "rgb(" + parseInt(r) + "," + parseInt(g) + "," + parseInt(b) + ")";
}

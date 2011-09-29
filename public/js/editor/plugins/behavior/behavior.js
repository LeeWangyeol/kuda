/* 
 * Kuda includes a library and editor for authoring interactive 3D content for the web.
 * Copyright (C) 2011 SRI International.
 *
 * This program is free software; you can redistribute it and/or modify it under the terms
 * of the GNU General Public License as published by the Free Software Foundation; either 
 * version 2 of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; 
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with this program; 
 * if not, write to the Free Software Foundation, Inc., 51 Franklin Street, Fifth Floor, 
 * Boston, MA 02110-1301 USA.
 */

(function() {

////////////////////////////////////////////////////////////////////////////////
//                     			   Helper Methods  		                      //
////////////////////////////////////////////////////////////////////////////////
	
	var injectBehaviorWidget = function(view) {
		if (view.toolTitle.match(/Project|project/) != null) {
			return;
		}
		
		var panels = view.panels,
			done = false;
			
		for (var j = 0, jl = panels.length; j < jl && !done; j++) {
			var widgets = panels[j].widgets;
			
			for (var k = 0, kl = widgets.length; k < kl && !done; k++) {
				var widget = widgets[k];
				
				if (widget instanceof editor.ui.ListWidget) {
					var bhvWgt = shorthand.createBehaviorWidget({
						height: editor.ui.Height.FULL
					});
					bhvWgt.addListener(shorthand.events.CreateBehavior, bhvMdl);
					bhvWgt.addListener(shorthand.events.UpdateBehavior, bhvMdl);
					
					// add the behavior widget
					view.sidePanel.addWidget(bhvWgt);
					
					// replace the createListItem method
					widget.behaviorWidget = bhvWgt;
					widget.createListItem = function() {
						return new shorthand.BhvListItem(this.behaviorWidget);
					};
					
					bhvWgt.parentPanel = view.sidePanel;
					bhvWgt.addListener(editor.events.WidgetVisible, function(obj) {
						var thisWgt = obj.widget,
							wgts = thisWgt.parentPanel.widgets;
						
						for (var ndx = 0, len = wgts.length; ndx < len; ndx++) {
							var wgt = wgts[ndx];
							
							if (wgt !== thisWgt) {
								wgt.setVisible(!obj.visible);
							}
						}
					});
					
					done = true;
				}
			}
		}
	};

////////////////////////////////////////////////////////////////////////////////
//                     			   Initialization  		                      //
////////////////////////////////////////////////////////////////////////////////

	var shorthand = editor.tools.behavior = editor.tools.behavior || {},
		bhvMdl = null;
	
	shorthand.init = function() {		
		var navPane = editor.ui.getNavPane('Behaviors');

		var bhvView = new BehaviorView(),
			bhvCtr = new BehaviorController();
		
		bhvMdl = new BehaviorModel();
		bhvCtr.setModel(bhvMdl);
		bhvCtr.setView(bhvView);
		
		navPane.add(bhvView);
	
		// grab all views
		var views = editor.getViews(),
			models = editor.getModels();
		
		// for each view, if there is a list widget, insert a behavior widget
		// and replace the createListItem() method in the list widget
		for (var i = 0, il = views.length; i < il; i++) {
			injectBehaviorWidget(views[i]);
		}
		
		for (var i = 0, il = models.length; i < il; i++) {
			var mdl = models[i];
			
			if (mdl !== bhvMdl) {
				shorthand.treeModel.listenTo(mdl);
			}
		}
		
		shorthand.treeModel.addCitizen(hemi.world.camera);	
		
		editor.addListener(editor.events.PluginLoaded, function(name) {
			var model = editor.getModel(name),
				view = editor.getView(name);
			
			if (model !== bhvMdl) {
				shorthand.treeModel.listenTo(model);
			}
			injectBehaviorWidget(view);
		});
	};	
	
////////////////////////////////////////////////////////////////////////////////
//                     			  Tool Definition  		                      //
////////////////////////////////////////////////////////////////////////////////
    
    editor.ToolConstants = editor.ToolConstants || {};
	editor.ToolConstants.SHAPE_PICK = "ShapePick";
	editor.ToolConstants.CAM_MOVE = "CameraMove";
	
	shorthand.events = {
		ArgumentSet: "messaging.ArgumentSet",
		TriggerSet: "messaging.TriggerSet",
		ActionSet: "messaging.ActionSet",
	    EditTarget: "messaging.view.EditTarget",
	    RemoveTarget: "messaging.eventList.RemoveTarget",
	    SaveTarget: "messaging.view.SaveTarget",
		SelectTrigger: "messaging.SelectTrigger",
		SelectAction: "messaging.SelectAction",
		SelectTarget: "messaging.SelectTarget",
		CloneTarget: "messaging.CloneTarget",

		CreateBehavior: "messaging.CreateBehavior",
		UpdateBehavior: "messaging.UpdateBehavior"
	};
	    
////////////////////////////////////////////////////////////////////////////////
//                                   Model                                    //
////////////////////////////////////////////////////////////////////////////////


    /**
     * A BehaviorModel
     */
    var BehaviorModel = editor.ToolModel.extend({
		init: function() {
			this._super('behavior');
			
			this.dispatchProxy = editor.getDispatchProxy();
			this.msgTarget = null;
			this.source = null;
			this.type = null;
			this.handler = null;
			this.method = null;
			this.args = new Hashtable();
			
			this.autoCompleteList = [{
				label: hemi.dispatch.MSG_ARG + 'data.',
				value: hemi.dispatch.MSG_ARG + 'data.',
				desc: 'message data object'
			}];
	    },
		
		copyTarget: function(msgTarget) {
			var spec = this.dispatchProxy.getTargetSpec(msgTarget),
				isValueCheck = msgTarget.handler instanceof hemi.handlers.ValueCheck,
				source, type, handler, method, argList;
			
			if (isValueCheck) {
				type = msgTarget.handler.values[0];
				handler = msgTarget.handler.handler;
				method = msgTarget.handler.func;
				argList = msgTarget.handler.args;
				
				if (spec.src === hemi.world.WORLD_ID) {
					source = shorthand.treeData.createShapePickCitizen(msgTarget.handler.citizen);
				} else {
					source = shorthand.treeData.createCamMoveCitizen(hemi.world.camera);
				}
			} else {
				source = spec.src;
				type = spec.msg;
				handler = msgTarget.handler;
				method = msgTarget.func;
				argList = msgTarget.args;
			}
			
			this.setTrigger(source, type);
			this.setAction(handler, method);
			
			if (argList != null) {
				var meta = editor.data.getMetaData(),
					citType = handler.getCitizenType(),
					params = meta.getParameters(citType, method);
				
				if (!params) {
					// If the metadata is missing, try the old way to get the
					// parameter names. Unfortunately this won't work if Hemi
					// is minified.
					params = editor.utils.getFunctionParams(handler[method]);
				}
				
				for (var ndx = 0, len = params.length; ndx < len; ndx++) {
					this.setArgument(params[ndx], argList[ndx]);
				}
			}
		},
		
		notify: function(eventType, data) {
			if (eventType === editor.events.WorldCleaned 
					|| eventType === editor.events.WorldLoaded) {
				this._super(eventType, data);
				return;
			}
			var args = data.args || [],
				trigger = data.trigger,
				action = data.action;
			
			if (eventType === shorthand.events.UpdateBehavior) {
				if (data.target !== null) {
					this.copyTarget(data.target);
				}
				
				this.msgTarget = data.target;
			}
			
			this.setTrigger(trigger.citizen, trigger.type);
			this.setAction(action.handler, action.method);
			
			for (var ndx = 0, len = args.length; ndx < len; ndx++) {
				var arg = args[ndx];
				
				this.setArgument(arg.name, arg.value);
			}
			
			this.save(data.name, data.type, data.actor);
		},
		
		removeTarget: function(target) {
			if (this.msgTarget === target) {
				this.msgTarget = null;
			}

	        this.notifyListeners(editor.events.Removed, target);	
			this.dispatchProxy.removeTarget(target);
			
			if (target.handler instanceof hemi.handlers.ValueCheck) {
				target.handler.cleanup();
			}
		},
		
	    save: function(name, opt_type, opt_actor) {
			var values = this.args.values(),
				args = [],
				newTarget;
			
			if (this.msgTarget !== null) {
				this.dispatchProxy.removeTarget(this.msgTarget);
				
				if (this.msgTarget.handler instanceof hemi.handlers.ValueCheck) {
					this.msgTarget.handler.cleanup();
					this.msgTarget.citizen = null;
				}
				
				this.msgTarget.cleanup();
			}
			
			for (var ndx = 0, len = values.length; ndx < len; ndx++) {
				var val = values[ndx];
				args[val.ndx] = val.value;
			}
			
			if (this.source.shapePick) {
				this.dispatchProxy.swap();
				newTarget = hemi.handlers.handlePick(
					this.source.citizen,
					this.type,
					this.handler,
					this.method,
					args);
				this.dispatchProxy.unswap();
			}
			else if (this.source.camMove) {
				this.dispatchProxy.swap();
				var viewpoint = hemi.world.getCitizenById(this.type);
				newTarget = hemi.handlers.handleCameraMove(
					hemi.world.camera,
					viewpoint,
					this.handler,
					this.method,
					args);
				this.dispatchProxy.unswap();
			}
			else {
				var src = this.source === shorthand.treeData.MSG_WILDCARD ? hemi.dispatch.WILDCARD 
						: this.source.getId(),
					type = this.type === shorthand.treeData.MSG_WILDCARD ? hemi.dispatch.WILDCARD 
						: this.type;
				
				newTarget = this.dispatchProxy.registerTarget(
		            src,
		            type,
		            this.handler,
		            this.method,
		            args);
			}
			
			newTarget.name = name;
			newTarget.type = opt_type;
			
			var data = {
				target: newTarget,
				actor: opt_actor
			};
			
			if (this.msgTarget !== null) {
				newTarget.dispatchId = this.msgTarget.dispatchId;
				this.notifyListeners(editor.events.Updated, data);
			} else {
				this.notifyListeners(editor.events.Created, data);
			}
			
			this.msgTarget = null;
			this.args.each(function(key, value) {
				value.value = null;
			});
		},
	    
	    setAction: function(handler, method) {
	    	if (handler === this.handler && method === this.method) {
				return;
			}
	    	
	    	this.handler = handler;
	        this.method = method;
			this.args.clear();
			
			if (method !== null) {
				var meta = editor.data.getMetaData(),
					citType = this.handler.getCitizenType(),
					params = meta.getParameters(citType, method);
				
				if (!params) {
					// If the metadata is missing, try the old way to get the
					// parameter names. Unfortunately this won't work if Hemi
					// is minified.
					params = editor.utils.getFunctionParams(this.handler[method]);
				}
				
				for (var ndx = 0, len = params.length; ndx < len; ndx++) {
					var param = params[ndx];
					
		            this.args.put(param, {
						ndx: ndx,
						value: null
					});
				}
			}
			
			this.notifyListeners(shorthand.events.ActionSet, {
				handler: this.handler,
				method: this.method
			});
	    },
		
		setArgument: function(argName, argValue) {
	        var arg = this.args.get(argName);
	        
	        if (arg != null) {
	            arg.value = argValue;
	        }
	        
//	        this.args.put(argName, arg);
			this.notifyListeners(shorthand.events.ArgumentSet, {
				name: argName,
				value: argValue
			});
		},
	    
	    setTrigger: function(source, type) {
			if (source === this.source && type === this.type) {
				return;
			}
	    	
	    	if (source === null || source.getId != null) {
				this.source = source;
			} else if (source === hemi.dispatch.WILDCARD || source === shorthand.treeData.MSG_WILDCARD) {
				this.source = shorthand.treeData.MSG_WILDCARD;
			} else {
				this.source = hemi.world.getCitizenById(source);
			}
			
			if (type === hemi.dispatch.WILDCARD || type === shorthand.treeData.MSG_WILDCARD) {
				this.type = shorthand.treeData.MSG_WILDCARD;
			} else {
				this.type = type;
			}
			
			this.notifyListeners(shorthand.events.TriggerSet, {
				source: this.source,
				message: this.type
			});
	    },
		
		worldCleaned: function() {
			var targets = this.dispatchProxy.getTargets();
			
			for (var ndx = 0, len = targets.length; ndx < len; ndx++) {
	            var target = targets[ndx];
	            this.notifyListeners(editor.events.Removed, target);
	        }
			
			this.dispatchProxy.cleanup();
			
			this.source = null;
			this.type = null;
			this.handler = null;
			this.method = null;
			this.args.clear();
			this.msgTarget = null;
	    },
		
		worldLoaded: function() {
			var targets = this.dispatchProxy.getTargets();
			
			for (var ndx = 0, len = targets.length; ndx < len; ndx++) {
				var target = targets[ndx];
				
				if (target.name.match(editor.ToolConstants.EDITOR_PREFIX) === null) {
					this.notifyListeners(editor.events.Created, {
						target: target
					});
				}
	        }
	    }
	});
	
////////////////////////////////////////////////////////////////////////////////
//                              Private Methods                               //
////////////////////////////////////////////////////////////////////////////////   
	
		
	var	getChainMessages = function(citizen, method) {
		var type = citizen.getCitizenType ? citizen.getCitizenType() : citizen.name,
			key = type + '_' + method,
			msgList = shorthand.treeData.chainTable.get(key),
			messages;
		
		if (citizen.parent != null) {
			messages = getChainMessages(citizen.parent, method);
		} else {
			messages = [];
		}
		
		if (msgList !== null) {
			messages = messages.concat(msgList);
		}
		
		return messages;
	};
	
////////////////////////////////////////////////////////////////////////////////
//                               Table Widget                                 //
////////////////////////////////////////////////////////////////////////////////

   	var TableWidget = editor.ui.Widget.extend({
		init: function() {
			this.behaviors = new Hashtable();
			
			this._super({
				name: 'behaviorTableWidget',
				height: editor.ui.Height.MANUAL
			});
		},
		
		add: function(msgTarget, spec) {
			var data = shorthand.expandBehaviorData(msgTarget, spec),
				row = this.table.fnAddData([
					shorthand.getTriggerName(data).join('.'),
					shorthand.getActionName(data).join('.'),
					msgTarget.name,
					'<td> \
					<button class="editBtn">Edit</button>\
					<button class="chainBtn">Chain</button>\
					<button class="cloneBtn">Clone</button>\
					<button class="removeBtn">Remove</button>\
					</td>'
				]),
				tr = jQuery(this.table.fnGetNodes(row)),
				td = tr.find('td.editHead');
				
			bindButtons.call(this, tr, td, data, msgTarget);
			
			this.invalidate();
		},
		
		finishLayout: function() {
			this._super();
			
			this.tableElem = jQuery('<table></table>');
			this.container.append(this.tableElem);
			
			this.table = this.tableElem.dataTable({
				'bAutoWidth': false,
				'aoColumns' : [
					{ 'sTitle': 'Trigger' },
					{ 'sTitle': 'Action' },
					{ 'sTitle': 'Behavior' },
					{ 
						'sTitle': '', 
						'sClass': 'editHead'
					}
				],
				'sPaginationType': 'full_numbers',
				'aLengthMenu': [5, 10, 15, 20]
			});
			
			// modifications
			var ftr = this.container.find('.dataTables_filter'),
				lth = this.container.find('.dataTables_length'),
				fLbl = ftr.find('label'),
				ipt = fLbl.find('input'),
				lLbl = lth.find('label'),
				sel = lth.find('select');
				
			ftr.append(ipt);
			
			lth.append('<span>Show</span>').append(sel)
				.append('<span>entries</span>');
			sel.sb({
				ddCtx: '.topBottomSelect'
			});
			lLbl.hide();
		},
		
		remove: function(msgTarget) {
			var tr = this.behaviors.remove(msgTarget.dispatchId);
			this.table.fnDeleteRow(tr);
			
			this.invalidate();
		},
		
		update: function(msgTarget, spec) {
			var data = shorthand.expandBehaviorData(msgTarget, spec),
				row = jQuery(this.behaviors.get(msgTarget.dispatchId)),
				td = row.find('td.editHead');
			
			td.find('button').unbind('click');
			td.empty();
			
			this.table.fnUpdate([
					shorthand.getTriggerName(data).join('.'),
					shorthand.getActionName(data).join('.'),
					msgTarget.name,
					'<td> \
					<button class="editBtn">Edit</button>\
					<button class="chainBtn">Chain</button>\
					<button class="cloneBtn">Clone</button>\
					<button class="removeBtn">Remove</button>\
					</td>'
				], row[0]);
			
			bindButtons.call(this, row, td, data, msgTarget);
			this.invalidate();
		}
	});
	
	var bindButtons = function(tr, td, data, msgTarget) {			
		var	msgs = getChainMessages(data.handler, data.method),
			wgt = this;
			
		tr.data('behavior', msgTarget);
		this.behaviors.put(msgTarget.dispatchId, tr[0]);
		
		td.find('.editBtn').bind('click', function(evt) {
			var bhv = tr.data('behavior');					
			wgt.notifyListeners(shorthand.events.SelectTarget, bhv);
		});
		
		if (msgs.length > 0) {
			td.find('.chainBtn').data('chainMsgs', msgs)
			.bind('click', function(evt) {
				var tr = jQuery(this).parents('tr'),
					target = tr.data('behavior'),
					handler = target.handler,
					messages = jQuery(this).data('chainMsgs');
				
				if (handler instanceof hemi.handlers.ValueCheck) {
					target = handler;
					handler = target.handler;
				}
				
				// special case
				if (target.func === 'moveToView') {
					handler = shorthand.treeData.createCamMoveCitizen(hemi.world.camera);
					messages = [parseInt(target.args[0].replace(
						hemi.dispatch.ID_ARG, ''))];
				}
				wgt.notifyListeners(shorthand.events.SelectTrigger, {
					source: handler,
					messages: messages
				});
			});
		} else {
			td.find('.chainBtn').attr('disabled', 'disabled');
		}
		
		td.find('.cloneBtn').bind('click', function(evt) {
			var tr = jQuery(this).parents('tr'),
				target = tr.data('behavior');
			
			wgt.notifyListeners(shorthand.events.CloneTarget, {
				target: target,
				name: 'Copy of ' + target.name
			});
			
		});
		td.find('.removeBtn').bind('click', function(evt) {
			var tr = jQuery(this).parents('tr'),
				target = tr.data('behavior');
				
			wgt.notifyListeners(shorthand.events.RemoveTarget, target);
		});
	};
	
////////////////////////////////////////////////////////////////////////////////
//                                   View                                     //
////////////////////////////////////////////////////////////////////////////////   

	var BehaviorView = editor.ToolView.extend({
		init: function() {
			this._super({
				toolName: 'Behaviors',
				toolTip: 'Overview of behaviors',
				elemId: 'behaviorBtn',
				id: 'behavior'
			});
			
			this.addPanel(new editor.ui.Panel({
				location: editor.ui.Location.TOP,
				classes: ['bhvTopPanel', 'noSpecialButtons'],
				name: 'topPanel'
			}));
			this.addPanel(new editor.ui.Panel({
				location: editor.ui.Location.BOTTOM,
				classes: ['bhvBottomPanel'],
				name: 'bottomPanel'
			}));
						
			this.topPanel.addWidget(shorthand.createBehaviorWidget({
				height: editor.ui.Height.MANUAL
			}));			
			this.bottomPanel.addWidget(new TableWidget());
			
			this.topPanel.behaviorWidget.setVisible(true);
		}
	});
	
	
////////////////////////////////////////////////////////////////////////////////
//                                Controller                                  //
////////////////////////////////////////////////////////////////////////////////

    /**
     * The BehaviorController facilitates BehaviorModel and BehaviorView
     * communication by binding event and message handlers.
     */
    var BehaviorController = editor.ToolController.extend({
		init: function() {
			this._super();
    	},
    
		/**
	     * Binds event and message handlers to the view and model this object 
	     * references.  
	     */        
		bindEvents: function() {
			this._super();
			
			var model = this.model,
				view = this.view,
				tblWgt = view.bottomPanel.behaviorTableWidget,
				bhvWgt = view.topPanel.behaviorWidget;
			
			bhvWgt.addListener(shorthand.events.CreateBehavior, model);
			bhvWgt.addListener(shorthand.events.UpdateBehavior, model);
			
			// view specific
			view.topPanel.addListener(editor.events.PanelVisible, function(data) {
				if (data.visible) {
					bhvWgt.axnChooser.rebindTree();
					bhvWgt.trgChooser.rebindTree();
				}
			});
			tblWgt.addListener(shorthand.events.CloneTarget, function(data) {
				model.copyTarget(data.target);
				model.save(data.name);
			});
			tblWgt.addListener(shorthand.events.RemoveTarget, function(target) {
				model.removeTarget(target);
			});			
			tblWgt.addListener(shorthand.events.SelectTarget, function(target) {	
				var spec = model.dispatchProxy.getTargetSpec(target);
				
				bhvWgt.setTarget(target, spec);
			});
			tblWgt.addListener(shorthand.events.SelectTrigger, function(data) {
				bhvWgt.setTrigger(data.source, data.messages);
			});
			
			// model specific	
			model.addListener(editor.events.Created, function(data) {
				var target = data.target,
					spec = model.dispatchProxy.getTargetSpec(target);
				
				shorthand.modifyBehaviorListItems(target, spec);
				tblWgt.add(target, spec);
				
				bhvWgt.setVisible(false);
			});			
			model.addListener(editor.events.Removed, function(target) {
				var	spec = model.dispatchProxy.getTargetSpec(target);
				
				tblWgt.remove(target);
				shorthand.modifyBehaviorListItems(target, spec, 'remove');
			});			
			model.addListener(editor.events.Updated, function(data) {
				var target = data.target,
					spec = model.dispatchProxy.getTargetSpec(target);
				
				shorthand.modifyBehaviorListItems(target, spec, 'update');
				tblWgt.update(target, spec);
			});
			
			// behavior widget specific
			shorthand.addBehaviorListItemListener(
				shorthand.events.ListItemEdit, function(obj) {
					var spec = model.dispatchProxy.getTargetSpec(obj.target),
						wgt = obj.widget;
						
					wgt.setTarget(obj.target, spec);
					wgt.setVisible(true);
				});
			shorthand.addBehaviorListItemListener(
				shorthand.events.ListItemRemove, function(target) {
					model.removeTarget(target);
				});
				
			bhvWgt.cancelBtn.text('Clear');
			bhvWgt.setVisible = function(visible) {
				
			};
		}
	});

////////////////////////////////////////////////////////////////////////////////
//                     			  	Extra Scripts  		                      //
////////////////////////////////////////////////////////////////////////////////

	editor.getScript('js/editor/plugins/behavior/js/objectPicker.js');
	editor.getScript('js/editor/plugins/behavior/js/param.js');
	editor.getScript('js/editor/plugins/behavior/js/treeData.js');
	editor.getScript('js/editor/plugins/behavior/js/behaviorTrees.js');
	editor.getScript('js/editor/plugins/behavior/js/behaviorWidget.js');
	editor.getCss('js/editor/plugins/behavior/css/style.css');
})();

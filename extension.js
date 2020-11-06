/* -*- mode: js2 - indent-tabs-mode: nil - js2-basic-offset: 4 -*- */
const St = imports.gi.St;
const Meta = imports.gi.Meta;
const Lang = imports.lang;
const Main = imports.ui.main;
const Tweener = imports.tweener.tweener;
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const ExtensionUtils = imports.misc.extensionUtils;

const GSCHEMA_ID = "org.gnome.shell.extensions.shade-inactive-windows";

let on_window_created;

const WindowShader = new Lang.Class({
    Name: 'WindowShader',

    _init: function(actor) {
        this._desat_effect = new Clutter.DesaturateEffect({ factor: 0.0 });
        this._brightness_effect = new Clutter.BrightnessContrastEffect();
        actor.add_effect(this._desat_effect);
        actor.add_effect(this._brightness_effect);
        this.actor = actor;
        this._enabled = true;
        this._shadeLevel = 0.0;
        this._desat_effect.enabled = (this._shadeLevel > 0);
        this._brightness_effect.enabled = (this._shadeLevel > 0);
    },

    set shadeLevel(level) {
        this._shadeLevel = level;
        this._brightness_effect.set_brightness(
            level * ShadeInactiveWindowsSettings.get_double('shade-brightness')
        );
        this._desat_effect.set_factor(
            level * ShadeInactiveWindowsSettings.get_double('shade-desaturation')
        );
        this._brightness_effect.enabled = (this._shadeLevel > 0);
        this._desat_effect.enabled = (this._shadeLevel > 0);
    },

    get shadeLevel() {
        return this._shadeLevel;
    }
});

var ShadeInactiveWindowsSettings = {};
function init() {
    var schemaDir = ExtensionUtils.getCurrentExtension().dir.get_child('data').get_child('glib-2.0').get_child('schemas');
    var schemaSource = Gio.SettingsSchemaSource.get_default();

    if(schemaDir.query_exists(null)) {
        schemaSource = Gio.SettingsSchemaSource.new_from_directory(schemaDir.get_path(), schemaSource, false);
    }

    var schemaObj = schemaSource.lookup(GSCHEMA_ID, true);
    if(!schemaObj) {
        throw new Error('failure to look up schema');
    }
    ShadeInactiveWindowsSettings = new Gio.Settings({ settings_schema: schemaObj });
}

function enable() {

    function use_shader(meta_win) {
        if (!meta_win) {
            return false;
        }

        var blacklist = ShadeInactiveWindowsSettings.get_strv('exclude-apps');
        var title = meta_win.get_title().toLowerCase()
        var wmclass = meta_win.get_wm_class().toLowerCase()
        var type = meta_win.get_window_type()

        for (var i = 0; i < blacklist.length; i++) {
            var name = blacklist[i].toLowerCase();
            if (title.indexOf(name) != -1 || wmclass.indexOf(name) != -1) {
                // app in blacklist, return and do nothing
                return false;
            }
        }

        return (type == Meta.WindowType.NORMAL ||
            type == Meta.WindowType.DIALOG ||
            type == Meta.WindowType.MODAL_DIALOG);
    }

    function verifyShader(wa) {
        if (wa._inactive_shader)
            return;
        var meta_win = wa.get_meta_window();
        if (!use_shader(meta_win)) {
            return;
        }
        wa._inactive_shader = new WindowShader(wa);
        if(!wa._inactive_shader)
            return;
        if (!meta_win.has_focus()) {
            var shade_time = ShadeInactiveWindowsSettings.get_int('shade-time') / 1000;
            Tweener.addTween(wa._inactive_shader,
                             { shadeLevel: 1.0,
                               time: shade_time,
                               transition: 'linear'
                             });
        }
    }

    function focus(the_window) {
        global.get_window_actors().forEach(function(wa) {
            verifyShader(wa);
            if (!wa._inactive_shader)
                return;
            var shade_time = ShadeInactiveWindowsSettings.get_int('shade-time') / 1000;
            if (the_window == wa.get_meta_window()) {
                Tweener.addTween(wa._inactive_shader,
                                 { shadeLevel: 0.0,
                                   time: shade_time,
                                   transition: 'linear'
                 });
            } else if(wa._inactive_shader.shadeLevel == 0.0) {
                Tweener.addTween(wa._inactive_shader,
                                 { shadeLevel: 1.0,
                                   time: shade_time,
                                   transition: 'linear'
                                 });
            }
        });
    }

    function window_created(__unused_display, the_window) {
        if (use_shader(the_window)) {
            the_window._shade_on_focus = the_window.connect('focus', focus);
        }
    }
    on_window_created = global.display.connect('window-created', window_created);

    global.get_window_actors().forEach(function(wa) {
        var meta_win = wa.get_meta_window();
        if (!meta_win) {
            return;
        }
        verifyShader(wa);
        window_created(null, wa.get_meta_window());
    });
}

function disable() {
    if (on_window_created) {
        global.display.disconnect(on_window_created);
    }
    global.get_window_actors().forEach(function(wa) {
        var win = wa.get_meta_window();
        if (win && win._shade_on_focus) {
            win.disconnect(win._shade_on_focus);
            delete win._shade_on_focus;
        }
        if(wa._inactive_shader) {
            wa._inactive_shader.shadeLevel = 0.0;
            wa.remove_effect(wa._inactive_shader._desat_effect);
            wa.remove_effect(wa._inactive_shader._brightness_effect);
            delete wa._inactive_shader;
        }
    });
}

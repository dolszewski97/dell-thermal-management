/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/* exported init */

const GETTEXT_DOMAIN = 'dell-thermal-management-extension';

const { GObject, St, Gio, Clutter} = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const ModalDialog = imports.ui.modalDialog;
const Ornament = imports.ui.popupMenu.Ornament;

const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

class Extension {
    constructor(uuid) {
        this._uuid = uuid;

        ExtensionUtils.initTranslations(GETTEXT_DOMAIN);
    }

    enable() {
        this._settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.dellthermalmanagement');

        this._item = new PopupMenu.PopupSubMenuMenuItem('Thermal Management', true);
        this._item.icon.icon_name = 'applications-system-symbolic';

        let position = this._findMenuItemPosition(Main.panel.statusArea.aggregateMenu._power.menu) + 1;

        this._optimizedOption = this._createOptimizedOption();
        this._item.menu.addMenuItem(this._optimizedOption);

        this._quietOption = this._createQuietOption();
        this._item.menu.addMenuItem(this._quietOption);

        this._coolOption = this._createCoolOption();
        this._item.menu.addMenuItem(this._coolOption);

        this._ultraPerformanceOption = this._createUltraPerformanceOption();
        this._item.menu.addMenuItem(this._ultraPerformanceOption);

        Main.panel.statusArea.aggregateMenu.menu.addMenuItem(this._item, position);

        this._setThermalOrnament(this._settings.get_string("current-thermal-mode"));
    }

    disable() {
        this._deleteOptimizedOption();
        this._deleteQuietOption();
        this._deleteCoolOption();
        this._deleteUltraPerformanceOption();

        this._item.destroy();
        delete this._item;
    }

    _findMenuItemPosition(item) {
        let items = Main.panel.statusArea.aggregateMenu.menu._getMenuItems();

        for (let i=0; i < items.length; ++i) {
            if (items[i] == item) {
                return i;
            }
        }

        return null;
    }


    _createOptimizedOption() {
        let optimized = new PopupMenu.PopupMenuItem(_('Optimized'));

        optimized.connect('activate', () => {
            this._execCctk(
                ['--ThermalManagement=Optimized'],
                () => {
                    this._setThermalOrnament('optimized');

                    this._storeThermalMode("optimized");
                    this._notify("Optimized");
                }
            );
        });

        return optimized;
    }

    _deleteOptimizedOption() {
        this._optimizedOption.destroy();
        delete this._optimizedOption;
    }


    _createQuietOption() {
        let quiet = new PopupMenu.PopupMenuItem(_('Quiet'));

        quiet.connect('activate', () => {
            this._execCctk(
                ['--ThermalManagement=Quiet'],
                () => {
                    this._setThermalOrnament('quiet');

                    this._storeThermalMode("quiet");
                    this._notify("Quiet");
                }
            );

        });

        return quiet;
    }

    _deleteQuietOption() {
        this._quietOption.destroy();
        delete this._quietOption;
    }


    _createCoolOption() {
        let cool = new PopupMenu.PopupMenuItem(_('Cool'));

        cool.connect('activate', () => {
            this._execCctk(
                ['--ThermalManagement=Cool'],
                () => {
                    this._setThermalOrnament('cool');

                    this._storeThermalMode("cool");
                    this._notify("Cool");
                }
            );
        });

        return cool;
    }

    _deleteCoolOption() {
        this._coolOption.destroy();
        delete this._coolOption;
    }


    _createUltraPerformanceOption() {
        let ultraPerformance = new PopupMenu.PopupMenuItem(_('Ultra Performance'));

        ultraPerformance.connect('activate', () => {
            this._execCctk(
                ['--ThermalManagement=UltraPerformance'],
                () =>  {
                    this._setThermalOrnament('ultraPerformance');

                    this._storeThermalMode("ultraPerformance");
                    this._notify("Ultra Performance");
                }
            );
        });

        return ultraPerformance;
    }

    _deleteUltraPerformanceOption() {
        this._ultraPerformanceOption.destroy();
        delete this._ultraPerformanceOption;
    }


    _execCctk(args, onSuccessCb) {
        const command = ['/opt/dell/dcc/cctk'].concat(args);

        if (this.askBIOSSetupPassword) {
            new BIOSSetupPasswordModal(function (biosSetupPassword) {
                command.push('--ValSetupPwd=' + biosSetupPassword);
                priviledgedExec(command, onSuccessCb);
            });

            this.askBIOSSetupPassword = false;
        } else {
            priviledgedExec(command, onSuccessCb);
        }
    }

    _setThermalOrnament(itemCode) {
        const thermalModes = {
            'optimized': this._optimizedOption,
            'quiet': this._quietOption,
            'cool': this._coolOption,
            'ultraPerformance': this._ultraPerformanceOption
        };

        // Reset ornament
        for (const [code, option] of Object.entries(thermalModes)) {
            if (option) {
                option.setOrnament(Ornament.NONE);
            }
        }

        // Set ornament
        if (itemCode in thermalModes) {
            thermalModes[itemCode].setOrnament(Ornament.DOT);
        }

        log("[THERMAL] Changed Dell Thermal Management mode to " + itemCode);
    }

    _getCurrentThermalMode() {
        this._execCctk(
            ['--ThermalManagement'],
            () => _setInitThermalOrnament()
        );
    }

    _notify(mode) {
        Main.notify("Dell Thermal Mode changed to " + mode);
    }

    _storeThermalMode(mode) {
        this._settings.set_string("current-thermal-mode", mode);
    }
}

function init(meta) {
    return new Extension(meta.uuid);
}

const BIOSSetupPasswordModal = GObject.registerClass(
    class BIOSSetupPasswordModal extends ModalDialog.ModalDialog {
        _init(cb) {
            super._init();

            let box = new St.BoxLayout({ 
                vertical: true,
                style: 'spacing: 6px'
            });
            this.contentLayout.add(box);

            box.add(new St.Label({ text: _('Enter your BIOS Setup Password') + ':'}));
            let passwordField = St.PasswordEntry.new();

            box.add(passwordField);

            this.setButtons([
                {
                    label: _('Close'),
                    action: () => { this.close(global.get_current_time()); },
                    key: Clutter.Escape
                },
                { 
                    label: _('Ok'),
                    action: () => {
                        this.close(global.get_current_time());
                        cb(passwordField.text);
                    },
                    key: Clutter.Return
                }
            ]);

            // open the dialog to make all fields visible
            this.open(global.get_current_time());

            // to focus an element it first needs to visible
            global.stage.set_key_focus(passwordField);

            // watch for key press to close dialog on Escape or proceed on Ctrl+Return
            passwordField.connect('key-press-event', (o, e) => {
                const symbol = e.get_key_symbol();

                if (symbol === Clutter.KEY_Escape) {
                    this.close(global.get_current_time());
                } else if (symbol === Clutter.KEY_Return) {
                    this.close(global.get_current_time());
                    cb(passwordField.text);
                }
            });
            // Close dialog and proceed on Return key
            passwordField.clutter_text.connect('activate', (actor) => {
                this.close(global.get_current_time());
                cb(passwordField.text);
            });
        }
    });

// Run terminal commands as root and display output in a modal
function priviledgedExec(args, onSuccess) {
    try {
        let proc = Gio.Subprocess.new(
            ['pkexec', '--user', 'root'].concat(args),
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
        );

        proc.communicate_utf8_async(null, null, (proc, res) => {
            try {
                let [, stdout, stderr] = proc.communicate_utf8_finish(res);
                let dialog = null;

                // Failure
                if (!proc.get_successful()) {
                    if (stdout) {
                        dialog = new OutputModal(stdout);
                        dialog.open(global.get_current_time());
                    }
                    throw new Error(stderr);
                }

                // Success - store the result (thermal mode) of last executed command
                //this._type = stdout.substring(stdout.lastIndexOf("=") + 1);
                onSuccess();
            } catch (e) {
                logError(e);
            }
        });
    } catch (e) {
        logError(e);
    }
}

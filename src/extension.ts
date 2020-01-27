// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { globalAgent } from 'http';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	let globalState = context.globalState;

	const util = require('util');
	const exec = util.promisify(require('child_process').exec);

	// start outputChannel for Pflaumen SFDX to post to
	let outputChannel = vscode.window.createOutputChannel('Pflaumen SFDX');
	const fsPath = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : null;

	if (!globalState.get('combinedList')) {
		vscode.window.setStatusBarMessage('Pflaumen SFDX: Refreshing Org List...', getOrgList(false));
	}

	async function openWorkbench(orgAlias: String) {
		try {
			let targetUrl = vscode.workspace.getConfiguration('pflaumen-sfdx.workbench').get('URL');
			let command = 'sfdx dmg:workbench:open -u ' + orgAlias + ' -t ' + targetUrl;
			const { stdout, stderr } = await exec(command);
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: ' + stdout);
		} catch (err) {
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: ' + err);
			vscode.window.showErrorMessage('' + err);
		}
	}

	async function getOrgList(showOrgSelect: boolean) {
		vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: Refreshing Org List...');
		try {
			const { stdout, stderr } = await exec('sfdx force:org:list --json');
			const output = JSON.parse(stdout);
			globalState.update('nonScratchOrgList', output.result.nonScratchOrgs);
			globalState.update('scratchOrgList', output.result.scratchOrgs);
			buildOrgList();
			let combinedList: any = globalState.get('combinedList');
			if (showOrgSelect) {
				selectOrg(combinedList).then(orgAlias => {
					if (orgAlias && orgAlias !== 'refresh') {
						vscode.window.setStatusBarMessage('Pflaumen SFDX: Opening Workbench...', openWorkbench(orgAlias));
					}
				});
			}
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: Refreshing Org List Finished');
		} catch (err) {
			vscode.commands.executeCommand('extension.appendToOutputChannel', err);
			vscode.window.showErrorMessage('' + err);
		}
	}

	function selectOrg(combinedList: any): Thenable<String | undefined> {
		interface OrgQuickPickItem extends vscode.QuickPickItem {
			alias: String;
		}
		let items: OrgQuickPickItem[] = combinedList.map((org: { alias: string; username: string; orgType: string; lastUsed: boolean;}) => {
			return {
				label: (org.alias ? org.alias : '') + ((org.alias && org.username) ? ' - ' : '') + (org.username ? org.username : ''),
				alias: org.alias,
				description: (org.lastUsed ? 'Last Used ' : '')
			};
		});
		items.push(
			{
				label: 'Refresh Org List',
				alias: 'refresh'
			}
		);
		return vscode.window.showQuickPick(items).then(item => {
			if(item) {
				let showOrgSelect = true;
				for(let i=0;i<combinedList.length;i++) {
					if(combinedList[i].alias === item.alias  && item.alias !== 'refresh') {
						showOrgSelect = false;
						globalState.update('lastUsedOrg', combinedList[i]);
					}
				}
				buildOrgList();
			}
			return item ? item.alias : undefined;
		});
	}

	function buildOrgList() {
		let combinedList = [];
		if (globalState.get('lastUsedOrg')) {
			const lastUsedOrg: any = globalState.get('lastUsedOrg');
			if(lastUsedOrg.alias !== 'refresh') {
				combinedList.push(
					{
						label : lastUsedOrg.label,
						alias: lastUsedOrg.alias,
						username: lastUsedOrg.username,
						lastUsed: true
					}
				);
			}
		}
		const nonScratchOrgList: any = globalState.get('nonScratchOrgList');
		for (let i = 0; i < nonScratchOrgList.length; i++) {
			nonScratchOrgList[i].orgType = 'non';
			nonScratchOrgList[i].lastUsed = false;
			combinedList.push(nonScratchOrgList[i]);
		}
		// console.log('nonScratchOrgList: ' + JSON.stringify(nonScratchOrgList));
		const scratchOrgList: any = globalState.get('scratchOrgList');
		for (let i = 0; i < scratchOrgList.length; i++) {
			scratchOrgList[i].orgType = 'scratch';
			scratchOrgList[i].lastUsed = false;
			combinedList.push(scratchOrgList[i]);
		}
		// console.log('scratchOrgList: ' + JSON.stringify(scratchOrgList));

		globalState.update('combinedList', combinedList);
	}

	async function retrieveSource() {
		vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: Retrieving Source...');
		try {
			let command = 'sfdx dmg:source:retrieve -x ./manifest/package.xml';
			const { stdout, stderr } = await exec(command, { cwd: fsPath });
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: ' + stdout);
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: Retrieving Source Finished');
		} catch (err) {
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: ' + err);
			vscode.window.showErrorMessage('' + err);
		}
	}

	async function cleanup() {
		vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: Cleaning Up...');
		try {
			let command = 'sfdx dmg:source:cleanup';
			const { stdout, stderr } = await exec(command, { cwd: fsPath });
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: ' + stdout);
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: Cleaning Up Finished');
		} catch (err) {
			vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: ' + err);
			vscode.window.showErrorMessage('' + err);
		}
	}

	// openWorkbench
	vscode.commands.registerCommand('extension.openWorkbench', () => {
		// vscode.commands.executeCommand('extension.appendToOutputChannel', 'Pflaumen SFDX: Checking Org List...');
		// TODO: Add progress indicator?
		if (globalState.get('combinedList')) {
			selectOrg(globalState.get('combinedList')).then(orgAlias => {
				if (orgAlias && orgAlias !== 'refresh') {
					vscode.window.setStatusBarMessage('Pflaumen SFDX: Opening Workbench...', openWorkbench(orgAlias));
				} else if(orgAlias === 'refresh') {
					vscode.window.setStatusBarMessage('Pflaumen SFDX: Refreshing Org List...', getOrgList(true));
				}

			});
		} else {
			vscode.window.setStatusBarMessage('Pflaumen SFDX: Refreshing Org List...', getOrgList(true));
		}
	});

	// retrieveSource
	vscode.commands.registerCommand('extension.retrieveSource', () => {
		vscode.window.setStatusBarMessage('Pflaumen SFDX: Retrieving Source...', retrieveSource());
	});

	// cleanup
	vscode.commands.registerCommand('extension.cleanup', () => {
		vscode.window.setStatusBarMessage('Pflaumen SFDX: Cleaning Up...', cleanup());
	});

	// appendToOutputChannel
	context.subscriptions.push(vscode.commands.registerCommand('extension.appendToOutputChannel', (message) => {
		outputChannel.appendLine(new Date().toLocaleTimeString() + ' ' + message);
		outputChannel.show(true);
	}));
}
// this method is called when your extension is deactivated
export function deactivate() { }

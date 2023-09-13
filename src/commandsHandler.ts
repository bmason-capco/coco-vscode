import { window, commands, ExtensionContext, env, Uri } from "vscode";
import { PROJECT_OPEN_GITHUB_COMMAND, PROJECT_GITHUB_URL } from "./globals/consts";
import { getTabnineExtensionContext } from "./globals/tabnineExtensionContext";

export const SET_API_TOKEN_COMMAND = "CapcoCoCo.setApiToken";
export const STATUS_BAR_COMMAND = "TabNine.statusBar";

export const CMD_WRITE_UNIT_TESTS = "CapcoCoCo.writeUnitTestsForSelection";
export const CMD_DOCUMENT_CODE = "CapcoCoCo.documentCodeSelection";

export function registerCommands(
  context: ExtensionContext
): void {
  context.subscriptions.push(
    commands.registerCommand(SET_API_TOKEN_COMMAND, setApiToken)
  );
  context.subscriptions.push(
    commands.registerCommand(STATUS_BAR_COMMAND, handleStatusBar())
  );
  context.subscriptions.push(
    commands.registerCommand(PROJECT_OPEN_GITHUB_COMMAND, () => {
      void env.openExternal(Uri.parse(PROJECT_GITHUB_URL));
    }),
  );
  context.subscriptions.push(
    commands.registerCommand(CMD_WRITE_UNIT_TESTS, handleStatusBar())
  );
  context.subscriptions.push(
    commands.registerCommand(CMD_DOCUMENT_CODE, handleStatusBar())
  );
}

function handleStatusBar() {
  return (): void => {
    void commands.executeCommand(PROJECT_OPEN_GITHUB_COMMAND);
  };
}

async function setApiToken () {
  const context = getTabnineExtensionContext();
  const input = await window.showInputBox({
      prompt: 'Please enter your API token (find yours at coco.capcodevfx.com/token):',
      placeHolder: 'Your token goes here ...'
  });
  if (input !== undefined) {
    await context?.secrets.store('apiToken', input);
    void window.showInformationMessage(`CapcoCoCo: API Token was successfully saved`);
  }
};
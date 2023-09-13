import { Position, Range, TextDocument, WorkspaceConfiguration, workspace, window, env, Uri } from "vscode";
import {URL} from "url";
import fetch from "node-fetch";
import type { Config as HFCodeConfig } from "./configTemplates"
import { PREFIX, SUFFIX } from "./configTemplates"
import { AutocompleteResult, ResultEntry } from "./binary/requests/requests";
import { CHAR_LIMIT, FULL_BRAND_REPRESENTATION } from "./globals/consts";
import languages from "./globals/languages";
import { setDefaultStatus, setLoadingStatus } from "./statusBar/statusBar";
import { logInput, logOutput } from "./outputChannels";
import { getTabnineExtensionContext } from "./globals/tabnineExtensionContext";

export type CompletionType = "normal" | "snippet";

let didShowTokenWarning = false;
const errorShownDate: Record<number, number> = {};

export default async function runCompletion(
  document: TextDocument,
  position: Position,
  timeout?: number,
  currentSuggestionText = ""
): Promise<AutocompleteResult | null | undefined> {
  setLoadingStatus(FULL_BRAND_REPRESENTATION);
  const offset = document.offsetAt(position);
  const beforeStartOffset = Math.max(0, offset - CHAR_LIMIT);
  const afterEndOffset = offset + CHAR_LIMIT;
  const beforeStart = document.positionAt(beforeStartOffset);
  const afterEnd = document.positionAt(afterEndOffset);
  const prefix =  document.getText(new Range(beforeStart, position)) + currentSuggestionText;
  const suffix = document.getText(new Range(position, afterEnd));

  const config = workspace.getConfiguration("CapcoCoCo") as WorkspaceConfiguration & HFCodeConfig;
  const { modelIdOrEndpoint, isFillMode, autoregressiveModeTemplate, fillModeTemplate, stopTokens, tokensToClear, temperature, maxNewTokens } = config;
  const context = getTabnineExtensionContext();
  const apiToken = await context?.secrets.get("apiToken");

  let endpoint = ""
  try{
    // outputChannel.appendLine(`modelIdOrEndpoint: ${modelIdOrEndpoint}`);
    new URL(modelIdOrEndpoint);
    endpoint = modelIdOrEndpoint;
  }catch(e){
    endpoint = modelIdOrEndpoint;

    // if user hasn't supplied API Token yet, ask user to supply one
    if(!apiToken && !didShowTokenWarning){
      didShowTokenWarning = true;
      void window.showInformationMessage(`In order to use "${modelIdOrEndpoint}" through Capco CoCo API Inference, you'd need a CoCo token`,
        "Get your token"
      ).then(clicked => {
        if (clicked) {
          void env.openExternal(Uri.parse("https://github.com/CapcoDigitalEngineering/coco-vscode#api-token"));
        }
      });
    }
  }

  // use FIM (fill-in-middle) mode if suffix is available
  const prompt = (isFillMode && suffix.trim()) ? fillModeTemplate.replace(PREFIX, prefix).replace(SUFFIX, suffix) : autoregressiveModeTemplate.replace(PREFIX, prefix).replace(SUFFIX, suffix);
  const fim = !!suffix.trim();

  const data = {
    prompt,
    parameters: {
      max_new_tokens: clipMaxNewTokens(maxNewTokens as number),
      fim,
      language: document.languageId,
      temperature,
      do_sample: temperature > 0,
      top_p: 0.95,
      stop: stopTokens
    }
  };
  // outputChannel.appendLine(`body: ${JSON.stringify(data)}`);
logInput(prompt, data.parameters);

  const headers = {
    "Content-Type": "application/json",
    "Authorization": "",
  };
  if(apiToken){
    headers.Authorization = `Bearer ${apiToken}`;
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });

  if(!res.ok){
    console.error("Error sending a request", res.status, res.statusText);
    const FIVE_MIN_MS = 300_000;
    const showError = !errorShownDate[res.status] || Date.now() - errorShownDate[res.status] > FIVE_MIN_MS;
    if(showError){
      errorShownDate[res.status] = Date.now();
      await window.showErrorMessage(`HF Code Error: code - ${res.status}; msg - ${res.statusText}`);
    }
    setDefaultStatus();
    return null;
  }

  const generatedTextRaw = getGeneratedText(await res.json());
  // logOutput(generatedTextRaw);

  let generatedText = generatedTextRaw;
  if(generatedText.slice(0, prompt.length) === prompt){
    generatedText = generatedText.slice(prompt.length);
  }
  const regexToClear = new RegExp([...stopTokens, ...tokensToClear].map(token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  generatedText = generatedText.replace(regexToClear, "");
  logOutput(generatedText);

  const resultEntry: ResultEntry = {
    new_prefix: generatedText,
    old_suffix: "",
    new_suffix: ""
  }

  const result: AutocompleteResult = {
    results: [resultEntry],
    old_prefix: "",
    user_message: [],
    is_locked: false,
  }

  setDefaultStatus();

  return result;
}

function getGeneratedText(json: any): string{
  return json?.choices[0].text ?? json?.choices.text ?? "";
}

export type KnownLanguageType = keyof typeof languages;

export function getLanguageFileExtension(
  languageId: string
): string | undefined {
  return languages[languageId as KnownLanguageType];
}

export function getFileNameWithExtension(document: TextDocument): string {
  const { languageId, fileName } = document;
  if (!document.isUntitled) {
    return fileName;
  }
  const extension = getLanguageFileExtension(languageId);
  if (extension) {
    return fileName.concat(extension);
  }
  return fileName;
}

function clipMaxNewTokens(maxNewTokens: number): number {
  const MIN = 50;
  const MAX = 500;
  return Math.min(Math.max(maxNewTokens, MIN), MAX);
}


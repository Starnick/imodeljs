/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
// tslint:disable:no-direct-imports
import * as fs from "fs";
import * as path from "path";
import * as cpx from "cpx";
import "@bentley/presentation-frontend/lib/test/_helpers/MockFrontendEnvironment";
// common includes
import { I18NOptions } from "@bentley/imodeljs-i18n";
import { Logger, LogLevel } from "@bentley/bentleyjs-core";
import { LoggingNamespaces } from "@bentley/presentation-common";
import { Props as PresentationBackendProps } from "@bentley/presentation-backend/lib/Presentation";
import { Props as PresentationFrontendProps } from "@bentley/presentation-frontend/lib/PresentationManager";
import { NoRenderApp } from "@bentley/imodeljs-frontend";
import { initialize as initializeTesting, terminate as terminateTesting } from "@bentley/presentation-testing";

process.env.NODE_ENV = "development";

const copyBentleyBackendAssets = (outputDir: string) => {
  const bentleyPackagesPath = "node_modules/@bentley";
  fs.readdirSync(bentleyPackagesPath).map((packageName) => {
    const packagePath = path.resolve(bentleyPackagesPath, packageName);
    return path.join(packagePath, "lib", "assets");
  }).filter((assetsPath) => {
    return fs.existsSync(assetsPath);
  }).forEach((src) => {
    cpx.copySync(`${src}/**/*`, outputDir);
  });
};

const copyBentleyFrontendAssets = (outputDir: string) => {
  const bentleyPackagesPath = "node_modules/@bentley";
  fs.readdirSync(bentleyPackagesPath).map((packageName) => {
    const packagePath = path.resolve(bentleyPackagesPath, packageName);
    return path.join(packagePath, "lib", "public");
  }).filter((assetsPath) => {
    return fs.existsSync(assetsPath);
  }).forEach((src) => {
    cpx.copySync(`${src}/**/*`, outputDir);
  });
};

class IntegrationTestsApp extends NoRenderApp {
  protected static supplyI18NOptions(): I18NOptions {
    const urlTemplate = "file://" + path.join(path.resolve("lib/public/locales"), "{{lng}}/{{ns}}.json").replace(/\\/g, "/");
    return { urlTemplate };
  }
  protected static onStartup(): void {
    cpx.copySync(`assets/**/*`, "lib/assets");
    copyBentleyBackendAssets("lib/assets");
    copyBentleyFrontendAssets("lib/public");
  }
}

export const initialize = () => {
  // init logging (enable on demand while debugging)
  Logger.initializeToConsole();
  Logger.setLevel(LoggingNamespaces.ECObjects_ECExpressions, LogLevel.None);
  Logger.setLevel(LoggingNamespaces.ECPresentation, LogLevel.None);

  const backendInitProps: PresentationBackendProps = {
    rulesetDirectories: ["lib/assets/rulesets"],
    localeDirectories: ["lib/assets/locales"],
    activeLocale: "en-PSEUDO",
  };
  const frontendInitProps: PresentationFrontendProps = {
    activeLocale: "en-PSEUDO",
  };
  initializeTesting(backendInitProps, frontendInitProps, IntegrationTestsApp);
};

export const terminate = () => {
  terminateTesting(IntegrationTestsApp);
};

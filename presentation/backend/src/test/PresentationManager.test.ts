/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as moq from "typemoq";
import * as faker from "faker";
import * as path from "path";
const deepEqual = require("deep-equal"); // tslint:disable-line:no-var-requires
import {
  createRandomNodePathElementJSON, createRandomECInstanceNodeKey,
  createRandomECInstanceNodeKeyJSON,
  createRandomECClassInfoJSON, createRandomRelationshipPathJSON,
  createRandomECInstanceKeyJSON, createRandomECInstanceKey,
  createRandomDescriptor, createRandomCategory, createRandomEntityProps, createRandomId,
} from "@bentley/presentation-common/lib/test/_helpers/random";
import "@bentley/presentation-common/lib/test/_helpers/Promises";
import "./IModelHostSetup";
import { using, ActivityLoggingContext } from "@bentley/bentleyjs-core";
import { RelatedElementProps, EntityMetaData } from "@bentley/imodeljs-common";
import { IModelHost, IModelDb, Element, DrawingGraphic } from "@bentley/imodeljs-backend";
import { PageOptions, SelectionInfo, KeySet, PresentationError, PropertyInfoJSON, HierarchyRequestOptions, Paged, ContentRequestOptions } from "@bentley/presentation-common";
import { instanceKeyFromJSON } from "@bentley/presentation-common";
import { NodeJSON } from "@bentley/presentation-common";
import { ECInstanceNodeKeyJSON, NodeKeyJSON, nodeKeyFromJSON } from "@bentley/presentation-common";
import { ContentJSON } from "@bentley/presentation-common";
import { DescriptorJSON, SelectClassInfoJSON } from "@bentley/presentation-common";
import { PrimitiveTypeDescription, ArrayTypeDescription, StructTypeDescription } from "@bentley/presentation-common";
import { PropertiesFieldJSON, NestedContentFieldJSON, FieldJSON } from "@bentley/presentation-common";
import { KindOfQuantityInfo } from "@bentley/presentation-common";
import { PropertyJSON } from "@bentley/presentation-common";
import { ItemJSON } from "@bentley/presentation-common";
import { NativePlatformDefinition, NativePlatformRequestTypes } from "../NativePlatform";
import PresentationManager from "../PresentationManager";
import RulesetManager from "../RulesetManager";
import RulesetVariablesManager from "../RulesetVariablesManager";

describe("PresentationManager", () => {

  beforeEach(() => {
    IModelHost.shutdown();
    try {
      IModelHost.startup();
    } catch (e) {
      let isLoaded = false;
      try {
        IModelHost.platform;
        isLoaded = true;
      } catch (_e) { }
      if (!isLoaded)
        throw e; // re-throw if startup() failed to set up NativePlatform
    }
  });

  describe("constructor", () => {

    it("uses default native library implementation if not overridden", () => {
      using(new PresentationManager(), (manager) => {
        expect((manager.getNativePlatform() as any)._nativeAddon).instanceOf(IModelHost.platform.ECPresentationManager);
      });
    });

    it("uses addon implementation supplied through props", () => {
      const nativePlatformMock = moq.Mock.ofType<NativePlatformDefinition>();
      using(new PresentationManager({ addon: nativePlatformMock.object }), (manager) => {
        expect(manager.getNativePlatform()).eq(nativePlatformMock.object);
      });
    });

    describe("addon setup based on props", () => {

      const addon = moq.Mock.ofType<NativePlatformDefinition>();
      beforeEach(() => {
        addon.reset();
      });

      it("sets up ruleset directories if supplied", () => {
        const dirs = ["test1", "test2"];
        addon.setup((x) => x.setupRulesetDirectories(dirs)).verifiable();
        using(new PresentationManager({ addon: addon.object, rulesetDirectories: dirs }), (pm: PresentationManager) => { pm; });
        addon.verifyAll();
      });

      it("sets up locale directories if supplied", () => {
        const suppliedDirs = ["test1", "test2", "test2"];
        const addonDirs = [path.resolve(__dirname, "../assets/locales"), "test1", "test2"];
        addon.setup((x) => x.setupLocaleDirectories(addonDirs)).verifiable();
        using(new PresentationManager({ addon: addon.object, localeDirectories: suppliedDirs }), (pm: PresentationManager) => { pm; });
        addon.verifyAll();
      });

      it("sets up active locale if supplied", () => {
        const locale = faker.random.locale();
        using(new PresentationManager({ addon: addon.object, activeLocale: locale }), (manager) => {
          expect(manager.activeLocale).to.eq(locale);
        });
      });

    });

  });

  describe("props", () => {

    it("returns empty object if initialized without props", () => {
      using(new PresentationManager(undefined), (newManager) => {
        expect(newManager.props).to.deep.eq({});
      });
    });

    it("returns initialization props", () => {
      const props = { activeLocale: faker.random.locale() };
      using(new PresentationManager(props), (newManager) => {
        expect(newManager.props).to.equal(props);
      });
    });

  });

  describe("activeLocale", () => {

    const addonMock = moq.Mock.ofType<NativePlatformDefinition>();
    beforeEach(() => {
      addonMock.reset();
    });

    it("uses manager's activeLocale when not specified in request options", () => {
      const imodelMock = moq.Mock.ofType<IModelDb>();
      const rulesetId = faker.random.word();
      const locale = faker.random.locale();
      using(new PresentationManager({ addon: addonMock.object, activeLocale: locale }), async (manager) => {
        await manager.getNodesCount(ActivityLoggingContext.current, { imodel: imodelMock.object, rulesetId });
        addonMock.verify((x) => x.handleRequest(ActivityLoggingContext.current, moq.It.isAny(), moq.It.is((serializedRequest: string): boolean => {
          const request = JSON.parse(serializedRequest);
          return request.params.locale === locale;
        })), moq.Times.once());
      });
    });

    it("ignores manager's activeLocale when locale is specified in request options", () => {
      const imodelMock = moq.Mock.ofType<IModelDb>();
      const rulesetId = faker.random.word();
      const locale = faker.random.locale();
      using(new PresentationManager({ addon: addonMock.object, activeLocale: faker.random.locale() }), async (manager) => {
        expect(manager.activeLocale).to.not.eq(locale);
        await manager.getNodesCount(ActivityLoggingContext.current, { imodel: imodelMock.object, rulesetId, locale });
        addonMock.verify((x) => x.handleRequest(ActivityLoggingContext.current, moq.It.isAny(), moq.It.is((serializedRequest: string): boolean => {
          const request = JSON.parse(serializedRequest);
          return request.params.locale === locale;
        })), moq.Times.once());
      });
    });

  });

  describe("vars", () => {

    const addon = moq.Mock.ofType<NativePlatformDefinition>();
    const manager: PresentationManager = new PresentationManager({ addon: addon.object });

    it("returns variables manager", () => {
      const vars = manager.vars(faker.random.word());
      expect(vars).to.be.instanceOf(RulesetVariablesManager);
    });

  });

  describe("rulesets", () => {

    const addon = moq.Mock.ofType<NativePlatformDefinition>();
    const manager: PresentationManager = new PresentationManager({ addon: addon.object });

    it("returns rulesets manager", () => {
      expect(manager.rulesets()).to.be.instanceOf(RulesetManager);
    });

  });

  describe("dispose", () => {

    it("calls native platform dispose when manager is disposed", () => {
      const nativePlatformMock = moq.Mock.ofType<NativePlatformDefinition>();
      const manager = new PresentationManager({ addon: nativePlatformMock.object });
      manager.dispose();
      manager.dispose();
      // note: verify native platform's `dispose` called only once
      nativePlatformMock.verify((x) => x.dispose(), moq.Times.once());
    });

    it("throws when attempting to use native platform after disposal", () => {
      const nativePlatformMock = moq.Mock.ofType<NativePlatformDefinition>();
      const manager = new PresentationManager({ addon: nativePlatformMock.object });
      manager.dispose();
      expect(() => manager.getNativePlatform()).to.throw(PresentationError);
    });

  });

  describe("addon results conversion to Presentation objects", () => {

    let testData: any;
    const nativePlatformMock = moq.Mock.ofType<NativePlatformDefinition>();
    const imodelMock = moq.Mock.ofType<IModelDb>();
    let manager: PresentationManager;
    beforeEach(() => {
      testData = {
        rulesetId: faker.random.word(),
        pageOptions: { start: faker.random.number(), size: faker.random.number() } as PageOptions,
        displayType: faker.random.word(),
        selectionInfo: {
          providerName: faker.random.word(),
          level: faker.random.number(),
        } as SelectionInfo,
      };
      nativePlatformMock.reset();
      nativePlatformMock.setup((x) => x.getImodelAddon(imodelMock.object)).verifiable(moq.Times.atLeastOnce());
      manager = new PresentationManager({ addon: nativePlatformMock.object });
    });
    afterEach(() => {
      manager.dispose();
      nativePlatformMock.verifyAll();
    });

    const setup = (addonResponse: any) => {
      // nativePlatformMock the handleRequest function
      nativePlatformMock.setup((x) => x.handleRequest(ActivityLoggingContext.current, moq.It.isAny(), moq.It.isAnyString()))
        .returns(async () => JSON.stringify(addonResponse));
    };
    const verifyWithSnapshot = (result: any, expectedParams: any, recreateSnapshot: boolean = false) => {
      // verify the addon was called with correct params
      nativePlatformMock.verify((x) => x.handleRequest(ActivityLoggingContext.current, moq.It.isAny(), moq.It.is((serializedParam: string): boolean => {
        const param = JSON.parse(serializedParam);
        expectedParams = JSON.parse(JSON.stringify(expectedParams));
        return deepEqual(param, expectedParams);
      })), moq.Times.once());
      // verify the manager correctly used addonResponse to create its result
      expect(result).to.matchSnapshot(recreateSnapshot);
    };
    const verifyWithExpectedResult = (actualResult: any, expectedResult: any, expectedParams: any) => {
      // verify the addon was called with correct params
      nativePlatformMock.verify((x) => x.handleRequest(ActivityLoggingContext.current, moq.It.isAny(), moq.It.is((serializedParam: string): boolean => {
        const param = JSON.parse(serializedParam);
        expectedParams = JSON.parse(JSON.stringify(expectedParams));
        return deepEqual(param, expectedParams);
      })), moq.Times.once());
      // verify the manager correctly used addonResponse to create its result
      expect(actualResult).to.deep.eq(expectedResult);
    };

    it("returns root nodes", async () => {
      // what the addon receives
      const expectedParams = {
        requestId: NativePlatformRequestTypes.GetRootNodes,
        params: {
          paging: testData.pageOptions,
          rulesetId: testData.rulesetId,
        },
      };

      // what the addon returns
      const addonResponse: NodeJSON[] = [{
        key: {
          type: "type1",
          pathFromRoot: ["p1", "p2", "p3"],
        } as NodeKeyJSON,
        label: "test1",
        description: "description1",
        imageId: "img_1",
        foreColor: "foreColor1",
        backColor: "backColor1",
        fontStyle: "fontStyle1",
        hasChildren: true,
        isSelectionDisabled: true,
        isEditable: true,
        isChecked: true,
        isCheckboxVisible: true,
        isCheckboxEnabled: true,
        isExpanded: true,
      }, {
        key: {
          type: "ECInstanceNode",
          pathFromRoot: ["p1"],
          instanceKey: createRandomECInstanceKeyJSON(),
        } as ECInstanceNodeKeyJSON,
        label: "test2",
        description: "description2",
        imageId: "",
        foreColor: "",
        backColor: "",
        fontStyle: "",
        hasChildren: false,
        isSelectionDisabled: false,
        isEditable: false,
        isChecked: false,
        isCheckboxVisible: false,
        isCheckboxEnabled: false,
        isExpanded: false,
      }, {
        key: {
          type: "some node",
          pathFromRoot: ["p1", "p3"],
        } as NodeKeyJSON,
        label: "test2",
      }];
      setup(addonResponse);

      // test
      const options: Paged<HierarchyRequestOptions<IModelDb>> = {
        imodel: imodelMock.object,
        rulesetId: testData.rulesetId,
        paging: testData.pageOptions,
      };
      const result = await manager.getNodes(ActivityLoggingContext.current, options);
      verifyWithSnapshot(result, expectedParams);
    });

    it("returns root nodes count", async () => {
      // what the addon receives
      const expectedParams = {
        requestId: NativePlatformRequestTypes.GetRootNodesCount,
        params: {
          rulesetId: testData.rulesetId,
        },
      };

      // what the addon returns
      const addonResponse = 456;
      setup(addonResponse);

      // test
      const options: HierarchyRequestOptions<IModelDb> = {
        imodel: imodelMock.object,
        rulesetId: testData.rulesetId,
      };
      const result = await manager.getNodesCount(ActivityLoggingContext.current, options);
      verifyWithExpectedResult(result, addonResponse, expectedParams);
    });

    it("returns root nodes and root nodes count when requesting first page", async () => {
      // what the addon receives
      const pageOptions = { start: 0, size: 2 };
      const expectedGetRootNodesParams = {
        requestId: NativePlatformRequestTypes.GetRootNodes,
        params: {
          paging: pageOptions,
          rulesetId: testData.rulesetId,
        },
      };
      const expectedGetRootNodesCountParams = {
        requestId: NativePlatformRequestTypes.GetRootNodesCount,
        params: {
          rulesetId: testData.rulesetId,
          paging: pageOptions,
        },
      };

      // what the addon returns
      const addonGetRootNodesResponse: NodeJSON[] = [{
        key: {
          type: "type1",
          pathFromRoot: ["p1", "p2", "p3"],
        } as NodeKeyJSON,
        label: "test1",
        description: "description1",
        imageId: "img_1",
        foreColor: "foreColor1",
        backColor: "backColor1",
        fontStyle: "fontStyle1",
        hasChildren: true,
        isSelectionDisabled: true,
        isEditable: true,
        isChecked: true,
        isCheckboxVisible: true,
        isCheckboxEnabled: true,
        isExpanded: true,
      }, {
        key: {
          type: "ECInstanceNode",
          pathFromRoot: ["p1"],
          instanceKey: createRandomECInstanceKeyJSON(),
        } as ECInstanceNodeKeyJSON,
        label: "test2",
        description: "description2",
        imageId: "",
        foreColor: "",
        backColor: "",
        fontStyle: "",
        hasChildren: false,
        isSelectionDisabled: false,
        isEditable: false,
        isChecked: false,
        isCheckboxVisible: false,
        isCheckboxEnabled: false,
        isExpanded: false,
      }, {
        key: {
          type: "some node",
          pathFromRoot: ["p1", "p3"],
        } as NodeKeyJSON,
        label: "test2",
      }];
      const addonGetRootNodesCountResponse = 456;

      setup(addonGetRootNodesCountResponse);
      setup(addonGetRootNodesResponse);

      const options: Paged<HierarchyRequestOptions<IModelDb>> = {
        imodel: imodelMock.object,
        rulesetId: testData.rulesetId,
        paging: pageOptions,
      };
      const result = await manager.getNodesAndCount(ActivityLoggingContext.current, options);

      verifyWithSnapshot(result.nodes, expectedGetRootNodesParams);
      verifyWithExpectedResult(result.count, addonGetRootNodesCountResponse, expectedGetRootNodesCountParams);
    });

    it("returns child nodes", async () => {
      // what the addon receives
      const parentNodeKeyJSON = createRandomECInstanceNodeKeyJSON();
      const expectedParams = {
        requestId: NativePlatformRequestTypes.GetChildren,
        params: {
          nodeKey: parentNodeKeyJSON,
          paging: testData.pageOptions,
          rulesetId: testData.rulesetId,
        },
      };

      // what the addon returns
      const addonResponse: NodeJSON[] = [{
        key: {
          type: "ECInstanceNode",
          pathFromRoot: ["p1"],
          instanceKey: createRandomECInstanceKeyJSON(),
        } as ECInstanceNodeKeyJSON,
        label: "test2",
      }, {
        key: {
          type: "type 2",
          pathFromRoot: ["p1", "p3"],
        } as NodeKeyJSON,
        label: "test3",
      }];
      setup(addonResponse);

      // test
      const options: Paged<HierarchyRequestOptions<IModelDb>> = {
        imodel: imodelMock.object,
        rulesetId: testData.rulesetId,
        paging: testData.pageOptions,
      };
      const result = await manager.getNodes(ActivityLoggingContext.current, options, nodeKeyFromJSON(parentNodeKeyJSON));
      verifyWithSnapshot(result, expectedParams);
    });

    it("returns child nodes count", async () => {
      // what the addon receives
      const parentNodeKeyJSON = createRandomECInstanceNodeKeyJSON();
      const expectedParams = {
        requestId: NativePlatformRequestTypes.GetChildrenCount,
        params: {
          nodeKey: parentNodeKeyJSON,
          rulesetId: testData.rulesetId,
        },
      };

      // what the addon returns
      const addonResponse = 789;
      setup(addonResponse);

      // test
      const options: HierarchyRequestOptions<IModelDb> = {
        imodel: imodelMock.object,
        rulesetId: testData.rulesetId,
      };
      const result = await manager.getNodesCount(ActivityLoggingContext.current, options, nodeKeyFromJSON(parentNodeKeyJSON));
      verifyWithExpectedResult(result, addonResponse, expectedParams);
    });

    it("returns child nodes and child node count when requesting first page", async () => {
      // what the addon receives
      const pageOptions = { start: 0, size: 2 };
      const parentNodeKeyJSON = createRandomECInstanceNodeKeyJSON();
      const expectedGetChildNodesParams = {
        requestId: NativePlatformRequestTypes.GetChildren,
        params: {
          nodeKey: parentNodeKeyJSON,
          rulesetId: testData.rulesetId,
          paging: pageOptions,
        },
      };
      const expectedGetChildNodeCountParams = {
        requestId: NativePlatformRequestTypes.GetChildrenCount,
        params: {
          nodeKey: parentNodeKeyJSON,
          rulesetId: testData.rulesetId,
          paging: pageOptions,
        },
      };

      // what the addon returns
      const addonGetChildNodesResponse: NodeJSON[] = [{
        key: {
          type: "ECInstanceNode",
          pathFromRoot: ["p1"],
          instanceKey: createRandomECInstanceKeyJSON(),
        } as ECInstanceNodeKeyJSON,
        label: "test2",
      }, {
        key: {
          type: "type 2",
          pathFromRoot: ["p1", "p3"],
        } as NodeKeyJSON,
        label: "test3",
      }];
      const addonGetChildNodeCountResponse = 789;

      setup(addonGetChildNodeCountResponse);
      setup(addonGetChildNodesResponse);

      // test
      const options: Paged<HierarchyRequestOptions<IModelDb>> = {
        imodel: imodelMock.object,
        rulesetId: testData.rulesetId,
        paging: pageOptions,
      };
      const result = await manager.getNodesAndCount(ActivityLoggingContext.current, options, nodeKeyFromJSON(parentNodeKeyJSON));

      verifyWithSnapshot(result.nodes, expectedGetChildNodesParams);
      verifyWithExpectedResult(result.count, addonGetChildNodeCountResponse, expectedGetChildNodeCountParams);
    });

    it("returns filtered node paths", async () => {
      // what the addon receives
      const expectedParams = {
        requestId: NativePlatformRequestTypes.GetFilteredNodePaths,
        params: {
          filterText: "filter",
          rulesetId: testData.rulesetId,
        },
      };

      // what addon returns
      const addonResponse = [createRandomNodePathElementJSON(0)];
      setup(addonResponse);

      // test
      const options: HierarchyRequestOptions<IModelDb> = {
        imodel: imodelMock.object,
        rulesetId: testData.rulesetId,
      };
      const result = await manager.getFilteredNodePaths(ActivityLoggingContext.current, options, "filter");
      verifyWithSnapshot(result, expectedParams);
    });

    it("returns node paths", async () => {
      // what the addon receives
      const keyJsonArray = [[createRandomECInstanceKeyJSON(), createRandomECInstanceKeyJSON()]];
      const keyArray = [keyJsonArray[0].map((json) => instanceKeyFromJSON(json))];
      const markedIndex = faker.random.number();
      const expectedParams = {
        requestId: NativePlatformRequestTypes.GetNodePaths,
        params: {
          paths: keyJsonArray,
          markedIndex,
          rulesetId: testData.rulesetId,
        },
      };

      // what addon returns
      const addonResponse = [createRandomNodePathElementJSON(0)];
      setup(addonResponse);

      // test
      const options: HierarchyRequestOptions<IModelDb> = {
        imodel: imodelMock.object,
        rulesetId: testData.rulesetId,
      };
      const result = await manager.getNodePaths(ActivityLoggingContext.current, options, keyArray, markedIndex);
      verifyWithSnapshot(result, expectedParams);
    });

    it("returns content descriptor", async () => {
      // what the addon receives
      const keys = new KeySet([createRandomECInstanceNodeKey(), createRandomECInstanceKey()]);
      const expectedParams = {
        requestId: NativePlatformRequestTypes.GetContentDescriptor,
        params: {
          displayType: testData.displayType,
          keys: keys.toJSON(),
          selection: testData.selectionInfo,
          rulesetId: testData.rulesetId,
        },
      };

      // what the addon returns
      const addonResponse: DescriptorJSON = {
        connectionId: faker.random.uuid(),
        inputKeysHash: faker.random.uuid(),
        contentOptions: faker.random.objectElement(),
        displayType: testData.displayType,
        selectClasses: [{
          selectClassInfo: createRandomECClassInfoJSON(),
          isSelectPolymorphic: true,
          pathToPrimaryClass: createRandomRelationshipPathJSON(1),
          relatedPropertyPaths: [createRandomRelationshipPathJSON(1)],
        }],
        fields: [{
          name: "Primitive property field with editor",
          category: createRandomCategory(),
          label: faker.random.words(),
          type: {
            typeName: "string",
            valueFormat: "Primitive",
          } as PrimitiveTypeDescription,
          isReadonly: faker.random.boolean(),
          priority: faker.random.number(),
          editor: {
            name: faker.random.word(),
            params: {
              some_param: faker.random.number(),
            },
          },
          properties: [{
            property: {
              classInfo: createRandomECClassInfoJSON(),
              name: faker.random.word(),
              type: "string",
              enumerationInfo: {
                choices: [{
                  label: faker.random.words(),
                  value: faker.random.uuid(),
                }, {
                  label: faker.random.words(),
                  value: faker.random.uuid(),
                }],
                isStrict: faker.random.boolean(),
              },
            } as PropertyInfoJSON,
            relatedClassPath: [],
          } as PropertyJSON],
        } as PropertiesFieldJSON, {
          name: "Complex array of structs property field",
          category: createRandomCategory(),
          label: faker.random.words(),
          type: {
            typeName: "string[]",
            valueFormat: "Array",
            memberType: {
              typeName: "SomeClass",
              valueFormat: "Struct",
              members: [{
                name: faker.random.word(),
                label: faker.random.words(),
                type: {
                  typeName: "string",
                  valueFormat: "Primitive",
                },
              }, {
                name: faker.random.word(),
                label: faker.random.words(),
                type: {
                  typeName: "string[]",
                  valueFormat: "Array",
                  memberType: {
                    typeName: "string",
                    valueFormat: "Primitive",
                  },
                } as ArrayTypeDescription,
              }],
            } as StructTypeDescription,
          } as ArrayTypeDescription,
          isReadonly: faker.random.boolean(),
          priority: faker.random.number(),
          properties: [{
            property: {
              classInfo: createRandomECClassInfoJSON(),
              name: faker.random.word(),
              type: "double",
              kindOfQuantity: {
                name: faker.random.word(),
                label: faker.random.words(),
                persistenceUnit: faker.random.word(),
                currentFormatId: faker.random.uuid(),
              } as KindOfQuantityInfo,
            } as PropertyInfoJSON,
            relatedClassPath: [],
          } as PropertyJSON],
        } as PropertiesFieldJSON, {
          name: "Nested content field",
          category: createRandomCategory(),
          label: faker.random.words(),
          type: {
            typeName: faker.random.word(),
            valueFormat: "Struct",
            members: [{
              name: faker.random.word(),
              label: faker.random.words(),
              type: {
                typeName: "string",
                valueFormat: "Primitive",
              },
            }],
          } as StructTypeDescription,
          contentClassInfo: createRandomECClassInfoJSON(),
          pathToPrimaryClass: createRandomRelationshipPathJSON(1),
          nestedFields: [{
            name: "Simple property field",
            category: createRandomCategory(),
            label: faker.random.words(),
            type: {
              typeName: "string",
              valueFormat: "Primitive",
            },
            isReadonly: faker.random.boolean(),
            priority: faker.random.number(),
          } as FieldJSON],
          isReadonly: faker.random.boolean(),
          priority: faker.random.number(),
        } as NestedContentFieldJSON],
        contentFlags: 0,
      };
      setup(addonResponse);

      // test
      const options: ContentRequestOptions<IModelDb> = {
        imodel: imodelMock.object,
        rulesetId: testData.rulesetId,
      };
      const result = await manager.getContentDescriptor(ActivityLoggingContext.current, options, testData.displayType,
        keys, testData.selectionInfo);
      verifyWithSnapshot(result, expectedParams);
    });

    it("returns content set size", async () => {
      // what the addon receives
      const keys = new KeySet([createRandomECInstanceNodeKey(), createRandomECInstanceKey()]);
      const descriptor = createRandomDescriptor();
      const expectedParams = {
        requestId: NativePlatformRequestTypes.GetContentSetSize,
        params: {
          keys: keys.toJSON(),
          descriptorOverrides: descriptor.createDescriptorOverrides(),
          rulesetId: testData.rulesetId,
        },
      };

      // what the addon returns
      const addonResponse = faker.random.number();
      setup(addonResponse);

      // test
      const options: ContentRequestOptions<IModelDb> = {
        imodel: imodelMock.object,
        rulesetId: testData.rulesetId,
      };
      const result = await manager.getContentSetSize(ActivityLoggingContext.current, options, descriptor, keys);
      verifyWithExpectedResult(result, addonResponse, expectedParams);
    });

    it("returns content set size when display type is passed in stead of descriptor", async () => {
      // what the addon receives
      const keys = new KeySet([createRandomECInstanceNodeKey(), createRandomECInstanceKey()]);
      const descriptor = createRandomDescriptor();
      const expectedParams = {
        requestId: NativePlatformRequestTypes.GetContentSetSize,
        params: {
          keys: keys.toJSON(),
          descriptorOverrides: {
            displayType: descriptor.displayType,
            hiddenFieldNames: [],
            contentFlags: 0,
          },
          rulesetId: testData.rulesetId,
        },
      };

      // what the addon returns
      const addonResponse = faker.random.number();
      setup(addonResponse);

      // test
      const options: ContentRequestOptions<IModelDb> = {
        imodel: imodelMock.object,
        rulesetId: testData.rulesetId,
      };
      const result = await manager.getContentSetSize(ActivityLoggingContext.current, options, descriptor.displayType, keys);
      verifyWithExpectedResult(result, addonResponse, expectedParams);
    });

    it("returns content", async () => {
      // what the addon receives
      const keys = new KeySet([createRandomECInstanceNodeKey(), createRandomECInstanceKey()]);
      const descriptor = createRandomDescriptor();
      const expectedParams = {
        requestId: NativePlatformRequestTypes.GetContent,
        params: {
          keys: keys.toJSON(),
          descriptorOverrides: descriptor.createDescriptorOverrides(),
          paging: testData.pageOptions,
          rulesetId: testData.rulesetId,
        },
      };

      // what the addon returns
      const fieldName = faker.random.word();
      const addonResponse = {
        descriptor: {
          displayType: descriptor.displayType,
          selectClasses: [{
            selectClassInfo: createRandomECClassInfoJSON(),
            isSelectPolymorphic: true,
            pathToPrimaryClass: [],
            relatedPropertyPaths: [],
          } as SelectClassInfoJSON],
          fields: [{
            name: fieldName,
            category: createRandomCategory(),
            label: faker.random.words(),
            type: {
              typeName: "string",
              valueFormat: "Primitive",
            } as PrimitiveTypeDescription,
            isReadonly: faker.random.boolean(),
            priority: faker.random.number(),
            properties: [{
              property: {
                classInfo: createRandomECClassInfoJSON(),
                name: faker.random.word(),
                type: "string",
              } as PropertyInfoJSON,
              relatedClassPath: [],
            } as PropertyJSON],
          } as PropertiesFieldJSON],
          contentFlags: 0,
        } as DescriptorJSON,
        contentSet: [{
          primaryKeys: [createRandomECInstanceKeyJSON()],
          classInfo: createRandomECClassInfoJSON(),
          label: faker.random.words(),
          imageId: faker.random.uuid(),
          values: {
            [fieldName]: faker.random.words(),
          },
          displayValues: {
            [fieldName]: faker.random.words(),
          },
          mergedFieldNames: [],
        } as ItemJSON],
      } as ContentJSON;
      setup(addonResponse);

      // test
      const options: Paged<ContentRequestOptions<IModelDb>> = {
        imodel: imodelMock.object,
        rulesetId: testData.rulesetId,
        paging: testData.pageOptions,
      };
      const result = await manager.getContent(ActivityLoggingContext.current, options, descriptor, keys);
      verifyWithSnapshot(result, expectedParams);
    });

    it("returns content when display types is passed in stead of descriptor", async () => {
      // what the addon receives
      const keys = new KeySet([createRandomECInstanceNodeKey(), createRandomECInstanceKey()]);
      const descriptor = createRandomDescriptor();
      const expectedParams = {
        requestId: NativePlatformRequestTypes.GetContent,
        params: {
          keys: keys.toJSON(),
          descriptorOverrides: {
            displayType: descriptor.displayType,
            hiddenFieldNames: [],
            contentFlags: 0,
          },
          paging: testData.pageOptions,
          rulesetId: testData.rulesetId,
        },
      };

      // what the addon returns
      const fieldName = faker.random.word();
      const addonResponse = {
        descriptor: {
          displayType: descriptor.displayType,
          selectClasses: [{
            selectClassInfo: createRandomECClassInfoJSON(),
            isSelectPolymorphic: true,
            pathToPrimaryClass: [],
            relatedPropertyPaths: [],
          } as SelectClassInfoJSON],
          fields: [{
            name: fieldName,
            category: createRandomCategory(),
            label: faker.random.words(),
            type: {
              typeName: "string",
              valueFormat: "Primitive",
            } as PrimitiveTypeDescription,
            isReadonly: faker.random.boolean(),
            priority: faker.random.number(),
            properties: [{
              property: {
                classInfo: createRandomECClassInfoJSON(),
                name: faker.random.word(),
                type: "string",
              } as PropertyInfoJSON,
              relatedClassPath: [],
            } as PropertyJSON],
          } as PropertiesFieldJSON],
          contentFlags: 0,
        } as DescriptorJSON,
        contentSet: [{
          primaryKeys: [createRandomECInstanceKeyJSON()],
          classInfo: createRandomECClassInfoJSON(),
          label: faker.random.words(),
          imageId: faker.random.uuid(),
          values: {
            [fieldName]: faker.random.words(),
          },
          displayValues: {
            [fieldName]: faker.random.words(),
          },
          mergedFieldNames: [],
        } as ItemJSON],
      } as ContentJSON;
      setup(addonResponse);

      // test
      const options: Paged<ContentRequestOptions<IModelDb>> = {
        imodel: imodelMock.object,
        rulesetId: testData.rulesetId,
        paging: testData.pageOptions,
      };
      const result = await manager.getContent(ActivityLoggingContext.current, options, descriptor.displayType, keys);
      verifyWithSnapshot(result, expectedParams);
    });

    it("returns content and content set size when requesting first page", async () => {
      // what the addon receives
      const pageOptions = { start: 0, size: 2 };
      const keys = new KeySet([createRandomECInstanceNodeKey(), createRandomECInstanceKey()]);
      const descriptor = createRandomDescriptor();
      const expectedGetContentParams = {
        requestId: NativePlatformRequestTypes.GetContent,
        params: {
          keys: keys.toJSON(),
          descriptorOverrides: descriptor.createDescriptorOverrides(),
          paging: pageOptions,
          rulesetId: testData.rulesetId,
        },
      };
      const expectedGetContentSetSizeParams = {
        requestId: NativePlatformRequestTypes.GetContentSetSize,
        params: {
          keys: keys.toJSON(),
          descriptorOverrides: descriptor.createDescriptorOverrides(),
          rulesetId: testData.rulesetId,
          paging: pageOptions,
        },
      };

      // what the addon returns
      const fieldName = faker.random.word();
      const addonGetContentResponse = {
        descriptor: {
          displayType: descriptor.displayType,
          selectClasses: [{
            selectClassInfo: createRandomECClassInfoJSON(),
            isSelectPolymorphic: true,
            pathToPrimaryClass: [],
            relatedPropertyPaths: [],
          } as SelectClassInfoJSON],
          fields: [{
            name: fieldName,
            category: createRandomCategory(),
            label: faker.random.words(),
            type: {
              typeName: "string",
              valueFormat: "Primitive",
            } as PrimitiveTypeDescription,
            isReadonly: faker.random.boolean(),
            priority: faker.random.number(),
            properties: [{
              property: {
                classInfo: createRandomECClassInfoJSON(),
                name: faker.random.word(),
                type: "string",
              } as PropertyInfoJSON,
              relatedClassPath: [],
            } as PropertyJSON],
          } as PropertiesFieldJSON],
          contentFlags: 0,
        } as DescriptorJSON,
        contentSet: [{
          primaryKeys: [createRandomECInstanceKeyJSON()],
          classInfo: createRandomECClassInfoJSON(),
          label: faker.random.words(),
          imageId: faker.random.uuid(),
          values: {
            [fieldName]: faker.random.words(),
          },
          displayValues: {
            [fieldName]: faker.random.words(),
          },
          mergedFieldNames: [],
        } as ItemJSON],
      } as ContentJSON;
      const addonGetContentSetSizeResponse = faker.random.number();

      setup(addonGetContentSetSizeResponse);
      setup(addonGetContentResponse);

      // test
      const options: Paged<ContentRequestOptions<IModelDb>> = {
        imodel: imodelMock.object,
        rulesetId: testData.rulesetId,
        paging: pageOptions,
      };
      const result = await manager.getContentAndSize(ActivityLoggingContext.current, options, descriptor, keys);

      verifyWithSnapshot(result.content, expectedGetContentParams);
      verifyWithExpectedResult(result.size, addonGetContentSetSizeResponse, expectedGetContentSetSizeParams);
    });

    describe("getDistinctValues", () => {

      it("returns distinct values", async () => {
        // what the addon receives
        const keys = new KeySet([createRandomECInstanceNodeKey(), createRandomECInstanceKey()]);
        const descriptor = createRandomDescriptor();
        const fieldName = faker.random.word();
        const maximumValueCount = faker.random.number();
        const expectedParams = {
          requestId: NativePlatformRequestTypes.GetDistinctValues,
          params: {
            descriptorOverrides: descriptor.createDescriptorOverrides(),
            keys: keys.toJSON(),
            fieldName,
            maximumValueCount,
            rulesetId: testData.rulesetId,
          },
        };

        // what the addon returns
        const addonResponse = [faker.random.word(), faker.random.word(), faker.random.word()];
        setup(addonResponse);

        // test
        const options: ContentRequestOptions<IModelDb> = {
          imodel: imodelMock.object,
          rulesetId: testData.rulesetId,
        };
        const result = await manager.getDistinctValues(ActivityLoggingContext.current, options, descriptor,
          keys, fieldName, maximumValueCount);
        verifyWithExpectedResult(result, addonResponse, expectedParams);
      });

      it("passes 0 for maximumValueCount by default", async () => {
        // what the addon receives
        const descriptor = createRandomDescriptor();
        const expectedParams = {
          requestId: NativePlatformRequestTypes.GetDistinctValues,
          params: {
            descriptorOverrides: descriptor.createDescriptorOverrides(),
            keys: { instanceKeys: [], nodeKeys: [] },
            fieldName: "",
            maximumValueCount: 0,
            rulesetId: testData.rulesetId,
          },
        };

        // what the addon returns
        const addonResponse: string[] = [];
        setup(addonResponse);

        // test
        const options: ContentRequestOptions<IModelDb> = {
          imodel: imodelMock.object,
          rulesetId: testData.rulesetId,
        };
        const result = await manager.getDistinctValues(ActivityLoggingContext.current, options, descriptor, new KeySet(), "");
        verifyWithExpectedResult(result, addonResponse, expectedParams);
      });

    });

    it("throws on invalid addon response", async () => {
      nativePlatformMock.setup((x) => x.handleRequest(ActivityLoggingContext.current, moq.It.isAny(), moq.It.isAnyString())).returns(() => (undefined as any));
      const options: HierarchyRequestOptions<IModelDb> = {
        imodel: imodelMock.object,
        rulesetId: testData.rulesetId,
      };
      return expect(manager.getNodesCount(ActivityLoggingContext.current, options)).to.eventually.be.rejectedWith(Error);
    });

  });

  describe("WIP", () => {

    // the below tests are temporary

    const imodelMock = moq.Mock.ofType<IModelDb>();
    const addonMock = moq.Mock.ofType<NativePlatformDefinition>();
    let manager: PresentationManager;

    beforeEach(() => {
      imodelMock.reset();
      addonMock.reset();
      manager = new PresentationManager({ addon: addonMock.object });
    });

    describe("getSelectionScopes", () => {

      it("returns expected selection scopes", async () => {
        const result = await manager.getSelectionScopes(ActivityLoggingContext.current, { imodel: imodelMock.object });
        expect(result.map((s) => s.id)).to.deep.eq(["element", "assembly", "top-assembly", "category", "model"]);
      });

    });

    describe("computeSelection", () => {

      const elementsMock = moq.Mock.ofType<IModelDb.Elements>();

      const createRandomTopmostElement = (): Element => {
        const mock = moq.Mock.ofType<Element>();
        mock.setup((x) => x.parent).returns(() => undefined);
        return mock.object;
      };

      const createRandomElement = (parentKey?: RelatedElementProps): Element => {
        const mock = moq.Mock.ofType<Element>();
        if (!parentKey)
          parentKey = { relClassName: faker.random.word(), id: createRandomId() };
        mock.setup((x) => x.parent).returns(() => parentKey);
        return mock.object;
      };

      beforeEach(() => {
        elementsMock.reset();
        imodelMock.setup((x) => x.elements).returns(() => elementsMock.object);
        imodelMock.setup((x) => x.getMetaData(moq.It.isAnyString())).returns((className: string) => new EntityMetaData({
          baseClasses: [],
          properties: {},
          ecclass: className,
        }));

        /*
        const meta = iModel.getMetaData(classFullName); // will load if necessary
        for (const propName in meta.properties) {
          if (propName) {
            const propMeta = meta.properties[propName];
            if (includeCustom || !propMeta.isCustomHandled || propMeta.isCustomHandledOrphan)
              func(propName, propMeta);
          }
        }

        if (wantSuper && meta.baseClasses && meta.baseClasses.length > 0)
          meta.baseClasses.forEach((baseClass) => this.forEachMetaData(iModel, baseClass, true, func, includeCustom));
        */
      });

      it("throws on invalid scopeId", async () => {
        await expect(manager.computeSelection(ActivityLoggingContext.current, { imodel: imodelMock.object }, [], "invalid")).to.eventually.be.rejected;
      });

      describe("scope: 'element'", () => {

        it("returns entity keys", async () => {
          const keys = [createRandomEntityProps(), createRandomEntityProps()];
          const result = await manager.computeSelection(ActivityLoggingContext.current, { imodel: imodelMock.object }, keys, "element");
          expect(result.size).to.eq(2);
          expect(result.has({ className: keys[0].classFullName, id: keys[0].id! })).to.be.true;
          expect(result.has({ className: keys[1].classFullName, id: keys[1].id! })).to.be.true;
        });

      });

      describe("scope: 'assembly'", () => {

        it("returns parent keys", async () => {
          const keys = [createRandomEntityProps(), createRandomEntityProps()];
          const elements = [createRandomElement(), createRandomElement()];
          elementsMock.setup((x) => x.getElement(keys[0].id!)).returns(() => elements[0]);
          elementsMock.setup((x) => x.getElement(keys[1].id!)).returns(() => elements[1]);

          const result = await manager.computeSelection(ActivityLoggingContext.current, { imodel: imodelMock.object }, keys, "assembly");
          expect(result.size).to.eq(2);
          expect(result.has({ className: elements[0].parent!.relClassName!, id: elements[0].parent!.id! })).to.be.true;
          expect(result.has({ className: elements[1].parent!.relClassName!, id: elements[1].parent!.id! })).to.be.true;
        });

        it("does not duplicate keys", async () => {
          const parentKey = { relClassName: faker.random.word(), id: createRandomId() };
          const keys = [createRandomEntityProps(), createRandomEntityProps()];
          const elements = [createRandomElement(parentKey), createRandomElement(parentKey)];
          elementsMock.setup((x) => x.getElement(keys[0].id!)).returns(() => elements[0]);
          elementsMock.setup((x) => x.getElement(keys[1].id!)).returns(() => elements[1]);

          const result = await manager.computeSelection(ActivityLoggingContext.current, { imodel: imodelMock.object }, keys, "assembly");
          expect(result.size).to.eq(1);
          expect(result.has({ className: parentKey.relClassName, id: parentKey.id })).to.be.true;
        });

        it("returns element key if it has no parent", async () => {
          const keys = [createRandomEntityProps()];
          const element = createRandomTopmostElement();
          elementsMock.setup((x) => x.getElement(keys[0].id!)).returns(() => element);
          const result = await manager.computeSelection(ActivityLoggingContext.current, { imodel: imodelMock.object }, keys, "assembly");
          expect(result.size).to.eq(1);
          expect(result.has({ className: keys[0].classFullName, id: keys[0].id! })).to.be.true;
        });

      });

      describe("scope: 'top-assembly'", () => {

        it("returns topmost parent key", async () => {
          const grandparentKey = { relClassName: faker.random.word(), id: createRandomId() };
          const parentKey = { relClassName: faker.random.word(), id: createRandomId() };
          const elementProps = createRandomEntityProps();
          const grandparent = createRandomTopmostElement();
          const parent = createRandomElement(grandparentKey);
          const element = createRandomElement(parentKey);
          elementsMock.setup((x) => x.getElement(elementProps.id!)).returns(() => element);
          elementsMock.setup((x) => x.getElement(parentKey.id!)).returns(() => parent);
          elementsMock.setup((x) => x.getElement(grandparentKey.id!)).returns(() => grandparent);

          const result = await manager.computeSelection(ActivityLoggingContext.current, { imodel: imodelMock.object }, [elementProps], "top-assembly");
          expect(result.size).to.eq(1);
          expect(result.has({ className: grandparentKey.relClassName!, id: grandparentKey.id! })).to.be.true;
        });

      });

      describe("scope: 'category'", () => {

        it("returns category key", async () => {
          const elementProps = createRandomEntityProps();
          const element = new DrawingGraphic({
            id: createRandomId(),
            classFullName: faker.random.word(),
            model: createRandomId(),
            category: createRandomId(),
            code: { scope: faker.random.word(), spec: faker.random.word() },
          }, imodelMock.object);
          elementsMock.setup((x) => x.getElement(elementProps.id!)).returns(() => element);

          const result = await manager.computeSelection(ActivityLoggingContext.current, { imodel: imodelMock.object }, [elementProps], "category");
          expect(result.size).to.eq(1);
          expect(result.has({ className: "BisCore:Category", id: element.category! })).to.be.true;
        });

        it("skips non-geometric elements", async () => {
          const elementProps = createRandomEntityProps();
          const element = createRandomElement();
          elementsMock.setup((x) => x.getElement(elementProps.id!)).returns(() => element);

          const result = await manager.computeSelection(ActivityLoggingContext.current, { imodel: imodelMock.object }, [elementProps], "category");
          expect(result.isEmpty).to.be.true;
        });

      });

      describe("scope: 'model'", () => {

        it("returns model key", async () => {
          const elementProps = createRandomEntityProps();
          const element = new DrawingGraphic({
            id: createRandomId(),
            classFullName: faker.random.word(),
            model: createRandomId(),
            category: createRandomId(),
            code: { scope: faker.random.word(), spec: faker.random.word() },
          }, imodelMock.object);
          elementsMock.setup((x) => x.getElement(elementProps.id!)).returns(() => element);

          const result = await manager.computeSelection(ActivityLoggingContext.current, { imodel: imodelMock.object }, [elementProps], "model");
          expect(result.size).to.eq(1);
          expect(result.has({ className: "BisCore:Model", id: element.model! })).to.be.true;
        });

      });

    });

  });

});

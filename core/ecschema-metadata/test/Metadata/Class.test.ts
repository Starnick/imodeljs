/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";

import { SchemaContext } from "../../src/Context";
import { DelayedPromiseWithProps } from "../../src/DelayedPromise";
import { ECObjectsError } from "../../src/Exception";
import { ECClass, MutableClass } from "../../src/Metadata/Class";
import { EntityClass } from "../../src/Metadata/EntityClass";
import { Mixin } from "../../src/Metadata/Mixin";
import { MutableSchema, Schema } from "../../src/Metadata/Schema";
import { SchemaItem } from "../../src/Metadata/SchemaItem";
import { SchemaKey } from "../../src/SchemaKey";
import { createSchemaJsonWithItems } from "../TestUtils/DeserializationHelpers";

describe("ECClass", () => {
  let schema: Schema;

  describe("get properties", () => {
    beforeEach(() => {
      schema = new Schema(new SchemaContext(), "TestSchema", 1, 0, 0);
    });

    it("inherited properties from base class", async () => {
      const baseClass = new EntityClass(schema, "TestBase");
      const basePrimProp = await (baseClass as ECClass as MutableClass).createPrimitiveProperty("BasePrimProp");

      const entityClass = new EntityClass(schema, "TestClass");
      await (entityClass as ECClass as MutableClass).createPrimitiveProperty("PrimProp");
      entityClass.baseClass = new DelayedPromiseWithProps(baseClass.key, async () => baseClass);

      expect(await entityClass.getProperty("BasePrimProp")).to.be.undefined;
      expect(await entityClass.getProperty("BasePrimProp", false)).to.be.undefined;
      expect(await entityClass.getProperty("BasePrimProp", true)).equal(basePrimProp);
      expect(await entityClass.getInheritedProperty("BasePrimProp")).equal(basePrimProp);
      expect(await entityClass.getInheritedProperty("PrimProp")).to.be.undefined;
    });

    it("inherited properties from base class synchronously", () => {
      const baseClass = (schema as MutableSchema).createEntityClassSync("TestBase");
      const basePrimProp = (baseClass as ECClass as MutableClass).createPrimitivePropertySync("BasePrimProp");

      const entityClass = (schema as MutableSchema).createEntityClassSync("TestClass");
      (entityClass as ECClass as MutableClass).createPrimitivePropertySync("PrimProp");
      entityClass.baseClass = new DelayedPromiseWithProps(baseClass.key, async () => baseClass);

      expect(entityClass.getPropertySync("BasePrimProp")).to.be.undefined;
      expect(entityClass.getPropertySync("BasePrimProp", false)).to.be.undefined;
      expect(entityClass.getPropertySync("BasePrimProp", true)).equal(basePrimProp);
      expect(entityClass.getInheritedPropertySync("BasePrimProp")).equal(basePrimProp);
      expect(entityClass.getInheritedPropertySync("PrimProp")).to.be.undefined;
    });

    it("case-insensitive search", async () => {
      const entityClass = new EntityClass(schema, "TestClass");
      const primProp = await (entityClass as ECClass as MutableClass).createPrimitiveProperty("TestProp");

      expect(await entityClass.getProperty("TESTPROP")).equal(primProp);
      expect(await entityClass.getProperty("testprop")).equal(primProp);
      expect(await entityClass.getProperty("tEsTpRoP")).equal(primProp);
    });

    it("case-insensitive inherited property search", async () => {
      const baseClass = new EntityClass(schema, "BaseClass");
      const primProp = await (baseClass as ECClass as MutableClass).createPrimitiveProperty("TestProp");

      const entityClass = new EntityClass(schema, "TestClass");
      entityClass.baseClass = new DelayedPromiseWithProps(baseClass.key, async () => baseClass);

      expect(await entityClass.getProperty("TESTPROP", true)).equal(primProp);
      expect(await entityClass.getProperty("testprop", true)).equal(primProp);
      expect(await entityClass.getProperty("tEsTpRoP", true)).equal(primProp);

      expect(await entityClass.getInheritedProperty("TESTPROP")).equal(primProp);
      expect(await entityClass.getInheritedProperty("testprop")).equal(primProp);
      expect(await entityClass.getInheritedProperty("tEsTpRoP")).equal(primProp);
    });
  });

  describe("deserialization", () => {
    it("class with base class", async () => {
      const schemaJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "TestSchema",
        version: "1.2.3",
        items: {
          testBaseClass: {
            schemaItemType: "EntityClass",
          },
          testClass: {
            schemaItemType: "EntityClass",
            baseClass: "TestSchema.testBaseClass",
          },
        },
      };

      schema = await Schema.fromJson(schemaJson, new SchemaContext());
      assert.isDefined(schema);

      const testClass = await schema.getItem<EntityClass>("testClass");
      assert.isDefined(testClass);
      assert.isDefined(await testClass!.baseClass);

      const baseClass = await schema.getItem<EntityClass>("testBaseClass");
      assert.isDefined(baseClass);
      assert.isTrue(baseClass === await testClass!.baseClass);
    });

    it("class with base class in reference schema", async () => {
      const schemaJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "TestSchema",
        version: "1.2.3",
        references: [
          {
            name: "RefSchema",
            version: "1.0.5",
          },
        ],
        items: {
          testClass: {
            schemaItemType: "EntityClass",
            baseClass: "RefSchema.BaseClassInRef",
          },
        },
      };

      const refSchema = new Schema(new SchemaContext(), "RefSchema", 1, 0, 5);
      const refBaseClass = await (refSchema as MutableSchema).createEntityClass("BaseClassInRef");

      const context = new SchemaContext();
      await context.addSchema(refSchema);

      schema = await Schema.fromJson(schemaJson, context);

      const testClass = await schema.getItem<EntityClass>("testClass");

      assert.isDefined(testClass);
      assert.isDefined(await testClass!.baseClass);
      assert.isTrue(await testClass!.baseClass === refBaseClass);
    });

    it("should throw for missing base class", () => {
      const schemaJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "TestSchema",
        version: "1.2.3",
        items: {
          testClass: {
            schemaItemType: "EntityClass",
            baseClass: "TestSchema.ClassDoesNotExist",
          },
        },
      };

      expect(Schema.fromJson(schemaJson, new SchemaContext())).to.be.rejectedWith(ECObjectsError);
    });

    const oneCustomAttributeJson = {
      $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
      name: "TestSchema",
      version: "1.2.3",
      items: {
        TestCAClass: { schemaItemType: "CustomAttributeClass", appliesTo: "AnyClass" },
        testClass: {
          schemaItemType: "EntityClass",
          customAttributes: [
            {
              className: "TestSchema.TestCAClass",
              ShowClasses: true,

            },
          ],
        },
      },
    };
    it("async - Deserialize One Custom Attribute", async () => {

      schema = await Schema.fromJson(oneCustomAttributeJson, new SchemaContext());

      const testClass = await schema.getItem<EntityClass>("testClass");

      assert.isDefined(testClass);
      assert.isDefined(testClass!.customAttributes!.get("TestSchema.TestCAClass"));
      assert.isTrue(testClass!.customAttributes!.get("TestSchema.TestCAClass")!.ShowClasses);
    });
    it("sync - Deserialize One Custom Attribute", () => {
      schema = Schema.fromJsonSync(oneCustomAttributeJson, new SchemaContext());

      const testClass = schema.getItemSync<EntityClass>("testClass");

      assert.isDefined(testClass);
      assert.isDefined(testClass!.customAttributes!.get("TestSchema.TestCAClass"));
      assert.isTrue(testClass!.customAttributes!.get("TestSchema.TestCAClass")!.ShowClasses);
    });
    const twoCustomAttributesJson = {
      $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
      name: "TestSchema",
      version: "1.2.3",
      items: {
        TestCAClassA: { schemaItemType: "CustomAttributeClass", appliesTo: "AnyClass" },
        TestCAClassB: { schemaItemType: "CustomAttributeClass", appliesTo: "AnyClass" },
        testClass: {
          schemaItemType: "EntityClass",
          customAttributes: [
            {
              className: "TestSchema.TestCAClassA",
            },
            {
              className: "TestSchema.TestCAClassB",
            },
          ],
        },
      },
    };
    it("async - Deserialize Two Custom Attributes", async () => {

      schema = await Schema.fromJson(twoCustomAttributesJson, new SchemaContext());

      const testClass = await schema.getItem<EntityClass>("testClass");

      assert.isDefined(testClass);
      assert.isDefined(testClass!.customAttributes!.get("TestSchema.TestCAClassA"));
      assert.isDefined(testClass!.customAttributes!.get("TestSchema.TestCAClassB"));
    });
    it("sync - Deserialize Two Custom Attributes", () => {
      schema = Schema.fromJsonSync(twoCustomAttributesJson, new SchemaContext());

      const testClass = schema.getItemSync<EntityClass>("testClass");

      assert.isDefined(testClass);
      assert.isDefined(testClass!.customAttributes!.get("TestSchema.TestCAClassA"));
      assert.isDefined(testClass!.customAttributes!.get("TestSchema.TestCAClassB"));
    });
    const mustBeAnArrayJson = {
      $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
      name: "TestSchema",
      version: "1.2.3",
      items: {
        testClass: {
          schemaItemType: "EntityClass",
          customAttributes: "ExampleCustomAttributes.ExampleSchema",
        },
      },
    };
    it("async - Custom Attributes must be an array", async () => {
      await expect(Schema.fromJson(mustBeAnArrayJson, new SchemaContext())).to.be.rejectedWith(ECObjectsError, `The ECClass TestSchema.testClass has an invalid 'customAttributes' attribute. It should be of type 'array'.`);
    });
    it("sync - Custom Attributes must be an array", async () => {
      assert.throws(() => Schema.fromJsonSync(mustBeAnArrayJson, new SchemaContext()), ECObjectsError, `The ECClass TestSchema.testClass has an invalid 'customAttributes' attribute. It should be of type 'array'.`);
    });
    it("sync - Deserialize Multiple Custom Attributes with additional properties", () => {
      const classJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "TestSchema",
        version: "1.2.3",
        items: {
          TestCAClassA: { schemaItemType: "CustomAttributeClass", appliesTo: "AnyClass" },
          TestCAClassB: { schemaItemType: "CustomAttributeClass", appliesTo: "AnyClass" },
          TestCAClassC: { schemaItemType: "CustomAttributeClass", appliesTo: "AnyClass" },
          testClass: {
            schemaItemType: "EntityClass",
            customAttributes: [
              {
                className: "TestSchema.TestCAClassA",
                ShowClasses: 1.2,
              },
              {
                className: "TestSchema.TestCAClassB",
                ExampleAttribute: true,
              },
              {
                className: "TestSchema.TestCAClassC",
                Example2Attribute: "example",
              },
            ],
          },
        },
      };
      schema = Schema.fromJsonSync(classJson, new SchemaContext());

      const testClass = schema.getItemSync<EntityClass>("testClass");

      assert.isDefined(testClass);
      assert.isDefined(testClass!.customAttributes!.get("TestSchema.TestCAClassA"));
      assert.isDefined(testClass!.customAttributes!.get("TestSchema.TestCAClassB"));
      assert.isDefined(testClass!.customAttributes!.get("TestSchema.TestCAClassC"));
      assert.strictEqual(testClass!.customAttributes!.get("TestSchema.TestCAClassA")!.ShowClasses, 1.2);
      assert.isTrue(testClass!.customAttributes!.get("TestSchema.TestCAClassB")!.ExampleAttribute);
      assert.strictEqual(testClass!.customAttributes!.get("TestSchema.TestCAClassC")!.Example2Attribute, "example");
    });

    // Used to test that all property types are deserialized correctly. For failure and other tests look at the property
    // specific test files.
    it("with properties", async () => {
      const schemaJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "TestSchema",
        version: "1.2.3",
        items: {
          testStruct: {
            schemaItemType: "StructClass",
          },
          testClass: {
            schemaItemType: "EntityClass",
            properties: [
              {
                type: "PrimitiveProperty",
                typeName: "double",
                name: "testPrimProp",
              },
              {
                type: "StructProperty",
                name: "testStructProp",
                typeName: "TestSchema.testStruct",
              },
              {
                type: "PrimitiveArrayProperty",
                typeName: "string",
                name: "testPrimArrProp",
              },
              {
                type: "StructArrayProperty",
                name: "testStructArrProp",
                typeName: "TestSchema.testStruct",
              },
            ],
          },
        },
      };

      const ecSchema = await Schema.fromJson(schemaJson, new SchemaContext());
      assert.isDefined(ecSchema);

      const testEntity = await ecSchema.getItem<EntityClass>("testClass");
      assert.isDefined(testEntity);

      const testPrimProp = await testEntity!.getProperty("testPrimProp");
      assert.isDefined(testPrimProp);
      const testPrimArrProp = await testEntity!.getProperty("testPrimArrProp");
      assert.isDefined(testPrimArrProp);
      const testStructProp = await testEntity!.getProperty("testStructProp");
      assert.isDefined(testStructProp);
      const testStructArrProp = await testEntity!.getProperty("testStructArrProp");
      assert.isDefined(testStructArrProp);
    });
  });

  describe("deserialization sync", () => {
    it("class with base class", () => {
      const schemaJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "TestSchema",
        version: "1.2.3",
        items: {
          testBaseClass: {
            schemaItemType: "EntityClass",
          },
          testClass: {
            schemaItemType: "EntityClass",
            baseClass: "TestSchema.testBaseClass",
          },
        },
      };

      schema = Schema.fromJsonSync(schemaJson, new SchemaContext());
      assert.isDefined(schema);

      const testClass = schema.getItemSync<EntityClass>("testClass");
      assert.isDefined(testClass);
      assert.isDefined(testClass!.getBaseClassSync());

      const baseClass = schema.getItemSync<EntityClass>("testBaseClass");
      assert.isDefined(baseClass);
      assert.isTrue(baseClass === testClass!.getBaseClassSync());
    });

    it("class with base class in reference schema", () => {
      const schemaJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "TestSchema",
        version: "1.2.3",
        references: [
          {
            name: "RefSchema",
            version: "1.0.5",
          },
        ],
        items: {
          testClass: {
            schemaItemType: "EntityClass",
            baseClass: "RefSchema.BaseClassInRef",
          },
        },
      };

      const refSchema = new Schema(new SchemaContext(), "RefSchema", 1, 0, 5);
      const refBaseClass = (refSchema as MutableSchema).createEntityClassSync("BaseClassInRef");

      const context = new SchemaContext();
      context.addSchemaSync(refSchema);

      schema = Schema.fromJsonSync(schemaJson, context);

      const testClass = schema.getItemSync<EntityClass>("testClass");

      assert.isDefined(testClass);
      assert.isDefined(testClass!.getBaseClassSync());
      assert.isTrue(testClass!.getBaseClassSync() === refBaseClass);
    });
    // Used to test that all property types are deserialized correctly. For failure and other tests look at the property
    // specific test files.
    it("with properties", () => {
      const schemaJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "TestSchema",
        version: "1.2.3",
        items: {
          testStruct: {
            schemaItemType: "StructClass",
          },
          testClass: {
            schemaItemType: "EntityClass",
            properties: [
              {
                type: "PrimitiveProperty",
                typeName: "double",
                name: "testPrimProp",
              },
              {
                type: "StructProperty",
                name: "testStructProp",
                typeName: "TestSchema.testStruct",
              },
              {
                type: "PrimitiveArrayProperty",
                typeName: "string",
                name: "testPrimArrProp",
              },
              {
                type: "StructArrayProperty",
                name: "testStructArrProp",
                typeName: "TestSchema.testStruct",
              },
            ],
          },
        },
      };

      const ecSchema = Schema.fromJsonSync(schemaJson, new SchemaContext());
      assert.isDefined(ecSchema);

      const testEntity = ecSchema.getItemSync<EntityClass>("testClass");
      assert.isDefined(testEntity);

      const testPrimProp = testEntity!.getPropertySync("testPrimProp");
      assert.isDefined(testPrimProp);
      const testPrimArrProp = testEntity!.getPropertySync("testPrimArrProp");
      assert.isDefined(testPrimArrProp);
      const testStructProp = testEntity!.getPropertySync("testStructProp");
      assert.isDefined(testStructProp);
      const testStructArrProp = testEntity!.getPropertySync("testStructArrProp");
      assert.isDefined(testStructArrProp);
    });
  });

  describe("toJson", () => {
    function getTestSchemaJson(classJson: any = {}) {
      return {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
        name: "TestSchema",
        version: "1.2.3",
        items: {
          testBaseClass: {
            schemaItemType: "EntityClass",
          },
          testClass: {
            schemaItemType: "EntityClass",
            baseClass: "TestSchema.testBaseClass",
            properties: [
              {
                name: "ValidProp",
                description: "A really long description...",
                label: "SomeDisplayLabel",
                type: "PrimitiveProperty",
                isReadOnly: true,
                priority: 100,
                typeName: "double",
              },
            ],
            ...classJson,
          },
        },
      };
    }
    const schemaJsonOne = getTestSchemaJson();

    it("async - Simple serialization", async () => {
      schema = await Schema.fromJson(schemaJsonOne, new SchemaContext());
      assert.isDefined(schema);

      const testClass = await schema.getItem<EntityClass>("testClass");
      assert.isDefined(testClass);
      expect(testClass).to.exist;
      const serialized = testClass!.toJson(true, true);
      const expectedJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/draft-01/schemaitem",
        name: "testClass",
        schema: "TestSchema",
        schemaVersion: "01.02.03",
        ...schemaJsonOne.items.testClass,
      };
      expect(serialized).eql(expectedJson);
    });

    it("should omit modifier if 'None'", async () => {
      schema = await Schema.fromJson(getTestSchemaJson({ modifier: "None" }), new SchemaContext());
      const testClass = await schema.getItem<EntityClass>("testClass");
      expect(testClass).to.exist;
      expect(testClass!.toJson(true, true)).to.not.have.property("modifier");
    });

    it("should include modifier if 'Abstract'", async () => {
      schema = await Schema.fromJson(getTestSchemaJson({ modifier: "Abstract" }), new SchemaContext());
      const testClass = await schema.getItem<EntityClass>("testClass");
      expect(testClass).to.exist;
      expect(testClass!.toJson(true, true)).to.include({ modifier: "Abstract" });
    });

    it("should include modifier if 'Sealed'", async () => {
      schema = await Schema.fromJson(getTestSchemaJson({ modifier: "Sealed" }), new SchemaContext());
      const testClass = await schema.getItem<EntityClass>("testClass");
      expect(testClass).to.exist;
      expect(testClass!.toJson(true, true)).to.include({ modifier: "Sealed" });
    });

    it("should omit customAttributes if empty", async () => {
      schema = await Schema.fromJson(getTestSchemaJson({ customAttributes: [] }), new SchemaContext());
      const testClass = await schema.getItem<EntityClass>("testClass");
      expect(testClass).to.exist;
      expect(testClass!.toJson(true, true)).to.not.have.property("customAttributes");
    });

    it("sync - Simple serialization", () => {
      schema = Schema.fromJsonSync(schemaJsonOne, new SchemaContext());
      assert.isDefined(schema);

      const testClass = schema.getItemSync<EntityClass>("testClass");
      assert.isDefined(testClass);
      const serialized = testClass!.toJson(true, true);
      const expectedJson = {
        $schema: "https://dev.bentley.com/json_schemas/ec/32/draft-01/schemaitem",
        name: "testClass",
        schema: "TestSchema",
        schemaVersion: "01.02.03",
        ...schemaJsonOne.items.testClass,
      };
      expect(serialized).eql(expectedJson);
    });
    const schemaJsonFive = {
      $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
      name: "TestSchema",
      version: "1.2.3",
      items: {
        TestCAClassA: { schemaItemType: "CustomAttributeClass", appliesTo: "AnyProperty" },
        TestCAClassB: { schemaItemType: "CustomAttributeClass", appliesTo: "AnyProperty" },
        TestCAClassC: { schemaItemType: "CustomAttributeClass", appliesTo: "AnyProperty" },
        testBaseClass: {
          schemaItemType: "EntityClass",
        },
        testClass: {
          schemaItemType: "EntityClass",
          baseClass: "TestSchema.testBaseClass",
          properties: [
            {
              name: "ValidProp",
              description: "A really long description...",
              label: "SomeDisplayLabel",
              type: "PrimitiveProperty",
              isReadOnly: true,
              priority: 100,
              typeName: "double",
              customAttributes: [
                {
                  className: "TestSchema.TestCAClassA",
                  ShowClasses: true,
                },
                {
                  className: "TestSchema.TestCAClassB",
                  FloatValue: 1.2,
                },
                {
                  className: "TestSchema.TestCAClassC",
                  IntegerValue: 5,
                },
              ],
            },
          ],
        },
      },
    };
    it("async - Serialization with multiple custom attributes- additional properties", async () => {
      schema = await Schema.fromJson(schemaJsonFive, new SchemaContext());
      assert.isDefined(schema);

      const testClass = await schema.getItem<EntityClass>("testClass");
      assert.isDefined(testClass);
      const serialized = testClass!.toJson(true, true);
      assert.isTrue(serialized.properties[0].customAttributes[0].ShowClasses);
      assert.strictEqual(serialized.properties[0].customAttributes[1].FloatValue, 1.2);
      assert.strictEqual(serialized.properties[0].customAttributes[2].IntegerValue, 5);
    });
    it("sync - Serialization with multiple custom attributes- additional properties", () => {
      schema = Schema.fromJsonSync(schemaJsonFive, new SchemaContext());
      assert.isDefined(schema);

      const testClass = schema.getItemSync<EntityClass>("testClass");
      assert.isDefined(testClass);
      const serialized = testClass!.toJson(true, true);
      assert.isTrue(serialized.properties[0].customAttributes[0].ShowClasses);
      assert.strictEqual(serialized.properties[0].customAttributes[1].FloatValue, 1.2);
      assert.strictEqual(serialized.properties[0].customAttributes[2].IntegerValue, 5);
    });
    const schemaJsonSix = {
      $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
      name: "TestSchema",
      version: "1.2.3",
      items: {
        testBaseClass: {
          schemaItemType: "EntityClass",
        },
        testClass: {
          schemaItemType: "EntityClass",
          baseClass: "TestSchema.testBaseClass",
          properties: [
            {
              name: "A",
              type: "PrimitiveProperty",
              typeName: "double",
            },
            {
              name: "B",
              type: "PrimitiveProperty",
              typeName: "double",
            },
            {
              name: "C",
              type: "PrimitiveProperty",
              typeName: "double",
            },
            {
              name: "D",
              type: "PrimitiveProperty",
              typeName: "double",
            },
          ],
        },
      },
    };
    it("async - Serialization with proper order of properties", async () => {
      schema = await Schema.fromJson(schemaJsonSix, new SchemaContext());
      assert.isDefined(schema);

      const testClass = await schema.getItem<EntityClass>("testClass");
      assert.isDefined(testClass);
      const serialized = testClass!.toJson(true, true);
      assert.strictEqual(serialized.properties[0].name, "A");
      assert.strictEqual(serialized.properties[1].name, "B");
      assert.strictEqual(serialized.properties[2].name, "C");
      assert.strictEqual(serialized.properties[3].name, "D");
    });
    it("sync - Serialization with proper order of properties", () => {
      schema = Schema.fromJsonSync(schemaJsonSix, new SchemaContext());
      assert.isDefined(schema);

      const testClass = schema.getItemSync<EntityClass>("testClass");
      assert.isDefined(testClass);
      const serialized = testClass!.toJson(true, true);
      assert.strictEqual(serialized.properties[0].name, "A");
      assert.strictEqual(serialized.properties[1].name, "B");
      assert.strictEqual(serialized.properties[2].name, "C");
      assert.strictEqual(serialized.properties[3].name, "D");
    });
  });

  describe("Base class traversal tests", () => {
    // This is the class hierarchy used in this test. The numbers indicate override priority,
    // i.e., the order that they should be returned by testClass.getAllBaseClasses():
    //
    //  2[A]  3(B)  5(C)  7(D)          [] := EntityClass
    //     \   /     /     /            () := Mixin
    //    1[ G ]  4(E)  6(F)
    //        \    /     /
    //        [    H    ]
    //
    const testSchemaJson = {
      $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
      name: "TestSchema",
      version: "01.00.00",
      alias: "ts",
      items: {
        A: { schemaItemType: "EntityClass" },
        B: { schemaItemType: "Mixin", appliesTo: "TestSchema.A" },
        C: { schemaItemType: "Mixin", appliesTo: "TestSchema.A" },
        D: { schemaItemType: "Mixin", appliesTo: "TestSchema.A" },
        E: { schemaItemType: "Mixin", appliesTo: "TestSchema.A", baseClass: "TestSchema.C" },
        F: { schemaItemType: "Mixin", appliesTo: "TestSchema.A", baseClass: "TestSchema.D" },
        G: { schemaItemType: "EntityClass", baseClass: "TestSchema.A", mixins: ["TestSchema.B"] },
        H: { schemaItemType: "EntityClass", baseClass: "TestSchema.G", mixins: ["TestSchema.E", "TestSchema.F"] },
      },
    };

    const childSchemaJson = {
      $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
      name: "ChildSchema",
      version: "01.00.00",
      alias: "ts",
      references: [
        {
          name: "TestSchema",
          version: "1.0.0",
        },
      ],
      items: {
        I: { schemaItemType: "EntityClass", baseClass: "TestSchema.H" },
      },
    };

    const grandChildSchemaJson = {
      $schema: "https://dev.bentley.com/json_schemas/ec/32/ecschema",
      name: "GrandChildSchema",
      version: "01.00.00",
      alias: "ts",
      references: [
        {
          name: "ChildSchema",
          version: "1.0.0",
        },
      ],
      items: {
        J: { schemaItemType: "EntityClass", baseClass: "ChildSchema.I" },
      },
    };

    const expectedNames = ["G", "A", "B", "E", "C", "F", "D"];

    it("getAllBaseClasses, should correctly traverse a complex inheritance hierarchy", async () => {
      const actualNames: string[] = [];

      schema = await Schema.fromJson(testSchemaJson, new SchemaContext());
      expect(schema).to.exist;

      const testClass = await schema.getItem<ECClass>("H");
      expect(testClass).to.exist;
      for await (const baseClass of testClass!.getAllBaseClasses()) {
        actualNames.push(baseClass.name);
      }

      expect(actualNames).to.eql(expectedNames);
    });

    it("getAllBaseClassesSync, should correctly traverse a complex inheritance hierarchy synchronously", () => {
      schema = Schema.fromJsonSync(testSchemaJson, new SchemaContext());
      expect(schema).to.exist;
      const testClass = schema.getItemSync<ECClass>("H");
      expect(testClass).to.exist;

      const syncActualNames: string[] = [];
      for (const baseClass of testClass!.getAllBaseClassesSync()) {
        syncActualNames.push(baseClass.name);
      }
      expect(syncActualNames).to.eql(expectedNames);
    });

    const expectedCallBackObjects = [{ name: "G", arg: "testArg" }, { name: "A", arg: "testArg" }, { name: "B", arg: "testArg" }, { name: "E", arg: "testArg" },
    { name: "C", arg: "testArg" }, { name: "F", arg: "testArg" }, { name: "D", arg: "testArg" }];

    it("traverseBaseClasses, should correctly traverse a complex inheritance hierarchy", async () => {
      const result: Array<{ name: string, arg: string }> = [];

      schema = await Schema.fromJson(testSchemaJson, new SchemaContext());
      expect(schema).to.exist;

      const testClass = await schema.getItem<ECClass>("H");
      expect(testClass).to.exist;

      await testClass!.traverseBaseClasses((ecClass, arg) => { result.push({ name: ecClass.name, arg }); return false; }, "testArg");

      expect(result).to.eql(expectedCallBackObjects);
    });

    it("traverseBaseClassesSync, should correctly traverse a complex inheritance hierarchy synchronously", () => {
      const result: Array<{ name: string, arg: string }> = [];

      schema = Schema.fromJsonSync(testSchemaJson, new SchemaContext());
      expect(schema).to.exist;

      const testClass = schema.getItemSync<ECClass>("H");
      expect(testClass).to.exist;

      testClass!.traverseBaseClassesSync((ecClass, arg) => { result.push({ name: ecClass.name, arg }); return false; }, "testArg");

      expect(result).to.eql(expectedCallBackObjects);
    });

    it("class 'is' a base class", async () => {
      schema = Schema.fromJsonSync(testSchemaJson, new SchemaContext());
      expect(schema).to.exist;

      const aClass = await schema.getItem<ECClass>("A");
      const bClass = await schema.getItem<ECClass>("B");
      const cClass = await schema.getItem<ECClass>("C");
      const dClass = await schema.getItem<ECClass>("D");
      const eClass = await schema.getItem<ECClass>("E");
      const fClass = await schema.getItem<ECClass>("F");
      const gClass = await schema.getItem<ECClass>("G");
      const hClass = await schema.getItem<ECClass>("H");

      expect(await hClass!.is(gClass!)).to.be.true;
      expect(await hClass!.is(aClass!)).to.be.true;
      expect(await hClass!.is(bClass!)).to.be.true;
      expect(await hClass!.is(eClass!)).to.be.true;
      expect(await hClass!.is(cClass!)).to.be.true;
      expect(await hClass!.is(fClass!)).to.be.true;
      expect(await hClass!.is(dClass!)).to.be.true;

      expect(await gClass!.is(eClass!)).to.be.false;
      expect(await gClass!.is(dClass!)).to.be.false;
      expect(await gClass!.is(hClass!)).to.be.false;
    });

    it("class 'is' a base class from different schema", async () => {
      const context = new SchemaContext();
      schema = await Schema.fromJson(testSchemaJson, context);
      const childSchema = await Schema.fromJson(childSchemaJson, context);
      const grandChildSchema = await Schema.fromJson(grandChildSchemaJson, context);

      const aClass = await schema.getItem<ECClass>("A");
      const bClass = await schema.getItem<ECClass>("B");
      const cClass = await schema.getItem<ECClass>("C");
      const dClass = await schema.getItem<ECClass>("D");
      const eClass = await schema.getItem<ECClass>("E");
      const fClass = await schema.getItem<ECClass>("F");
      const gClass = await schema.getItem<ECClass>("G");
      const hClass = await schema.getItem<ECClass>("H");
      const iClass = await childSchema.getItem<ECClass>("I");
      const jClass = await grandChildSchema.getItem<ECClass>("J");

      expect(await iClass!.is(gClass!)).to.be.true;
      expect(await iClass!.is(aClass!)).to.be.true;
      expect(await iClass!.is(bClass!)).to.be.true;
      expect(await iClass!.is(eClass!)).to.be.true;
      expect(await iClass!.is(cClass!)).to.be.true;
      expect(await iClass!.is(fClass!)).to.be.true;
      expect(await iClass!.is(dClass!)).to.be.true;
      expect(await iClass!.is(hClass!)).to.be.true;

      expect(await jClass!.is(gClass!)).to.be.true;
      expect(await jClass!.is(aClass!)).to.be.true;
      expect(await jClass!.is(bClass!)).to.be.true;
      expect(await jClass!.is(eClass!)).to.be.true;
      expect(await jClass!.is(cClass!)).to.be.true;
      expect(await jClass!.is(fClass!)).to.be.true;
      expect(await jClass!.is(dClass!)).to.be.true;
      expect(await jClass!.is(hClass!)).to.be.true;
      expect(await jClass!.is(iClass!)).to.be.true;

      expect(await gClass!.is(iClass!)).to.be.false;
      expect(await gClass!.is(jClass!)).to.be.false;
    });

    it("class 'is' a base class synchronous", () => {
      schema = Schema.fromJsonSync(testSchemaJson, new SchemaContext());
      expect(schema).to.exist;

      const aClass = schema.getItemSync<ECClass>("A");
      const bClass = schema.getItemSync<ECClass>("B");
      const cClass = schema.getItemSync<ECClass>("C");
      const dClass = schema.getItemSync<ECClass>("D");
      const eClass = schema.getItemSync<ECClass>("E");
      const fClass = schema.getItemSync<ECClass>("F");
      const gClass = schema.getItemSync<ECClass>("G");
      const hClass = schema.getItemSync<ECClass>("H");

      expect(hClass!.isSync(gClass!)).to.be.true;
      expect(hClass!.isSync(aClass!)).to.be.true;
      expect(hClass!.isSync(bClass!)).to.be.true;
      expect(hClass!.isSync(eClass!)).to.be.true;
      expect(hClass!.isSync(cClass!)).to.be.true;
      expect(hClass!.isSync(fClass!)).to.be.true;
      expect(hClass!.isSync(dClass!)).to.be.true;

      expect(gClass!.isSync(eClass!)).to.be.false;
      expect(gClass!.isSync(dClass!)).to.be.false;
      expect(gClass!.isSync(hClass!)).to.be.false;
    });
  });

  describe("NavProperty on CustomAttributeClass", () => {
    function createSchemaJson(nestedJson: any): any {
      return createSchemaJsonWithItems({
        TestCA: {
          schemaItemType: "CustomAttributeClass",
          ...nestedJson,
        },
        TestEntity: {
          schemaItemType: "EntityClass",
        },
        NavPropRelationship: {
          schemaItemType: "RelationshipClass",
          strength: "Embedding",
          strengthDirection: "Forward",
          modifier: "Sealed",
          source: {
            polymorphic: true,
            multiplicity: "(0..*)",
            roleLabel: "Source RoleLabel",
            constraintClasses: ["TestSchema.TestEntity"],
          },
          target: {
            polymorphic: true,
            multiplicity: "(0..*)",
            roleLabel: "Target RoleLabel",
            constraintClasses: ["TestSchema.TestEntity"],
          },
        },
      });
    }

    it("should throw", async () => {
      const json = createSchemaJson({
        appliesTo: "Any",
        properties: [
          {
            type: "NavigationProperty",
            name: "testNavProp",
            relationshipName: "TestSchema.NavPropRelationship",
            direction: "forward",
          },
        ],
      });

      await assert.isRejected(Schema.fromJson(json, new SchemaContext()), "The Navigation Property TestCA.testNavProp is invalid, because only EntityClasses, Mixins, and RelationshipClasses can have NavigationProperties.");
    });

    it("should throw synchronously", () => {
      const json = createSchemaJson({
        appliesTo: "Any",
        properties: [
          {
            type: "NavigationProperty",
            name: "testNavProp",
            relationshipName: "TestSchema.NavPropRelationship",
            direction: "forward",
          },
        ],
      });

      assert.throw(() => Schema.fromJsonSync(json, new SchemaContext()), "The Navigation Property TestCA.testNavProp is invalid, because only EntityClasses, Mixins, and RelationshipClasses can have NavigationProperties.");
    });
  });

  describe("classesAreEqualByKey tests", () => {
    const schemaKeyA = new SchemaKey("SchemaTest", 1, 2, 3);
    const schemaKeyB = new SchemaKey("OtherTestSchema", 1, 2, 3);
    const schemaA = new Schema(new SchemaContext(), schemaKeyA);
    const schemaB = new Schema(new SchemaContext(), schemaKeyB);

    it("should return false if names do not match", () => {
      const testClassA = new Mixin(schemaA, "MixinA");
      const testClassB = new Mixin(schemaA, "MixinB");
      expect(SchemaItem.equalByKey(testClassA, testClassB)).to.be.false;
    });

    it("should return false if types do not match", () => {
      const testClassA = new Mixin(schemaA, "MixinA");
      const testClassB = new Mixin(schemaB, "MixinA");
      expect(SchemaItem.equalByKey(testClassA, testClassB)).to.be.false;
    });

    it("should return true if keys match", () => {
      const testClassA = new Mixin(schemaA, "MixinA");
      const testClassB = new Mixin(schemaA, "MixinA");
      expect(SchemaItem.equalByKey(testClassA, testClassB)).to.be.true;
    });
  });
});

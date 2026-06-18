import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const schemaPath = resolve(__dirname, "../prisma/schema.prisma");
const schema = readFileSync(schemaPath, "utf-8");

interface Field {
  name: string;
  type: string;
  isOptional: boolean;
  isArray: boolean;
  isId: boolean;
  isUnique: boolean;
  attributes: string;
}

interface Model {
  name: string;
  fields: Field[];
}

interface Relation {
  from: string;
  to: string;
  fromField: string;
  fromCardinality: string;
  toCardinality: string;
  label: string;
}

function parseModels(schema: string): Model[] {
  const models: Model[] = [];
  const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;
  let match: RegExpExecArray | null;

  while ((match = modelRegex.exec(schema)) !== null) {
    const name = match[1];
    const body = match[2];
    const fields: Field[] = [];

    for (const line of body.split("\n")) {
      const trimmed = line.trim();
      if (
        !trimmed ||
        trimmed.startsWith("//") ||
        trimmed.startsWith("@@")
      )
        continue;

      const fieldMatch = trimmed.match(
        /^(\w+)\s+([\w\[\]?]+)\s*(.*)?$/
      );
      if (!fieldMatch) continue;

      const fieldName = fieldMatch[1];
      let fieldType = fieldMatch[2];
      const rest = fieldMatch[3] || "";

      const isArray = fieldType.endsWith("[]");
      const isOptional = fieldType.endsWith("?");
      fieldType = fieldType.replace("[]", "").replace("?", "");

      fields.push({
        name: fieldName,
        type: fieldType,
        isOptional,
        isArray,
        isId: rest.includes("@id"),
        isUnique: rest.includes("@unique"),
        attributes: rest,
      });
    }

    models.push({ name, fields });
  }

  return models;
}

function extractRelations(models: Model[]): Relation[] {
  const modelNames = new Set(models.map((m) => m.name));
  const relations: Relation[] = [];
  const seen = new Set<string>();

  for (const model of models) {
    for (const field of model.fields) {
      if (!modelNames.has(field.type)) continue;

      const relKey = [model.name, field.type].sort().join("-") + ":" + field.name;
      const reverseField = models
        .find((m) => m.name === field.type)
        ?.fields.find(
          (f) => f.type === model.name
        );

      const canonicalKey = [model.name, field.type].sort().join("-");

      if (field.attributes.includes("@relation")) {
        const pairKey = canonicalKey + ":" + field.name;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);

        let fromCard: string;
        let toCard: string;

        if (field.isArray) {
          fromCard = "}o";
          toCard = "o{";
        } else if (field.isOptional) {
          fromCard = "|o";
          toCard = "o|";
        } else {
          fromCard = "||";
          toCard = "||";
        }

        if (reverseField?.isArray) {
          toCard = "}o";
        } else if (reverseField?.isOptional) {
          toCard = "o|";
        } else if (reverseField) {
          toCard = "||";
        }

        if (field.isArray) {
          fromCard = "||";
          toCard = "}o";
        }

        relations.push({
          from: model.name,
          to: field.type,
          fromField: field.name,
          fromCardinality: fromCard,
          toCardinality: toCard,
          label: field.name,
        });
      }
    }
  }

  return relations;
}

function mermaidType(prismaType: string): string {
  const map: Record<string, string> = {
    String: "string",
    Int: "int",
    Float: "float",
    Boolean: "boolean",
    DateTime: "datetime",
    Json: "json",
  };
  return map[prismaType] || prismaType;
}

function generateMermaid(models: Model[], relations: Relation[]): string {
  const modelNames = new Set(models.map((m) => m.name));
  const lines: string[] = ["erDiagram"];

  for (const model of models) {
    lines.push(`    ${model.name} {`);
    for (const field of model.fields) {
      if (modelNames.has(field.type)) continue;

      let marker = "";
      if (field.isId) marker = "PK";
      else if (field.isUnique) marker = "UK";
      else if (field.attributes.includes("@relation")) marker = "FK";

      const typeName = mermaidType(field.type);
      const suffix = field.isOptional ? " \"nullable\"" : "";
      lines.push(
        `        ${typeName} ${field.name}${marker ? ` ${marker}` : ""}${suffix}`
      );
    }
    lines.push("    }");
  }

  lines.push("");

  for (const rel of relations) {
    lines.push(
      `    ${rel.from} ${rel.fromCardinality}--${rel.toCardinality} ${rel.to} : "${rel.label}"`
    );
  }

  return lines.join("\n");
}

const models = parseModels(schema);
const relations = extractRelations(models);
const mermaid = generateMermaid(models, relations);

const outPath = resolve(__dirname, "../er-diagram.mmd");
writeFileSync(outPath, mermaid, "utf-8");
console.log(`Mermaid ER diagram written to: ${outPath}`);
console.log(`Models: ${models.length}, Relations: ${relations.length}`);
console.log("\nTo render as SVG, run:");
console.log("  bunx @mermaid-js/mermaid-cli -i er-diagram.mmd -o er-diagram.svg");

import { ensureDb } from "@/lib/db/init";
import {
  getDirectionsForVersion,
  updateDirectionStatus,
} from "@/lib/db/queries/directions";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  ensureDb();
  const scriptId = Number(req.nextUrl.searchParams.get("scriptId"));
  const versionId = Number(req.nextUrl.searchParams.get("versionId"));

  if (!scriptId || !versionId) {
    return Response.json(
      { error: "scriptId and versionId are required" },
      { status: 400 }
    );
  }

  const rows = getDirectionsForVersion(scriptId, versionId);

  const directions = rows.map((row) => ({
    ...row,
    agreeingModels: JSON.parse(row.agreeingModels) as string[],
    disagreeingModels: JSON.parse(row.disagreeingModels) as Array<{
      model: string;
      alternativeType: string;
    }>,
  }));

  return Response.json(directions);
}

export async function PATCH(req: NextRequest) {
  ensureDb();
  const body = await req.json();
  const { id, status, userOverrideType } = body;

  if (!id || !status) {
    return Response.json(
      { error: "id and status are required" },
      { status: 400 }
    );
  }

  const updated = updateDirectionStatus(id, status, userOverrideType);
  if (!updated) {
    return Response.json({ error: "Direction not found" }, { status: 404 });
  }

  return Response.json({
    ...updated,
    agreeingModels: JSON.parse(updated.agreeingModels) as string[],
    disagreeingModels: JSON.parse(updated.disagreeingModels) as Array<{
      model: string;
      alternativeType: string;
    }>,
  });
}

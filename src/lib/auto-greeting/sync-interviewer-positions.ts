import { getClient, getDb } from "coze-coding-dev-sdk";
import { desc } from "drizzle-orm";
import * as sharedSchema from "@/storage/database/shared/schema";
import { positions } from "@/storage/database/shared/schema";
import { ensurePositionsTable } from "@/lib/db/ensure-positions-table";
import { ensureAutoGreetingJobPositionsTable } from "@/lib/db/ensure-auto-greeting-job-positions-table";
import {
  DEFAULT_AUTO_REPLY_CONFIG,
  DEFAULT_HUMAN_SIMULATION_CONFIG,
} from "@/lib/auto-greeting/constants";

type InterviewerPositionRecord = typeof positions.$inferSelect;

interface ExistingAutoGreetingJobRow {
  id: string;
  position_id: number | null;
  status: string | null;
  highlights: unknown;
  tenant_id: string | null;
  is_global: boolean | null;
}

function parseEducation(raw: string | null | undefined): string[] {
  if (!raw) {
    return [];
  }

  return Array.from(
    new Set(
      raw
        .split(/[\/,，、|]/)
        .map(item => item.trim())
        .filter(Boolean)
    )
  );
}

function parseExperience(raw: string | null | undefined): { min: number } {
  if (!raw) {
    return { min: 0 };
  }

  const match = raw.match(/(\d+)/);
  return { min: match ? Number(match[1]) : 0 };
}

function buildRequirements(position: InterviewerPositionRecord) {
  const skills = Array.from(
    new Set(
      [
        ...(Array.isArray(position.coreRequirements)
          ? position.coreRequirements
              .map(item => (item && typeof item === "object" && "name" in item ? String(item.name) : ""))
              .filter(Boolean)
          : []),
        ...(Array.isArray(position.softSkills)
          ? position.softSkills.map(item => String(item)).filter(Boolean)
          : []),
      ].map(item => item.trim()).filter(Boolean)
    )
  );

  return {
    skills,
    experience: parseExperience(position.experience),
    education: parseEducation(position.education),
    keywords: Array.from(new Set([position.title, position.department].filter(Boolean))),
  };
}

function buildHighlights(position: InterviewerPositionRecord): string[] {
  const focusAreas =
    position.interviewerPreferences &&
    typeof position.interviewerPreferences === "object" &&
    "focusAreas" in position.interviewerPreferences &&
    Array.isArray(position.interviewerPreferences.focusAreas)
      ? position.interviewerPreferences.focusAreas.map(item => String(item)).filter(Boolean)
      : [];

  return Array.from(new Set(focusAreas));
}

export async function syncAutoGreetingJobsFromInterviewerPositions(): Promise<void> {
  await ensurePositionsTable();
  await ensureAutoGreetingJobPositionsTable();

  const db = await getDb(sharedSchema);
  const sourcePositions = await db.select().from(positions).orderBy(desc(positions.createdAt));

  const client = await getClient();

  try {
    const existingResult = await client.query(`
      SELECT id, position_id, status, location, salary_min, salary_max, highlights,
             company_intro, company_size, company_industry, target_platforms,
             match_threshold, second_greeting_enabled, second_greeting_delay_hours,
             human_simulation, auto_reply_config, stats, created_by_id, tenant_id,
             is_global, created_by_name
      FROM ag_job_positions
      WHERE position_id IS NOT NULL
    `);

    const existingByPositionId = new Map<number, ExistingAutoGreetingJobRow>();
    for (const row of existingResult.rows) {
      const positionId = Number(row.position_id);
      if (Number.isFinite(positionId) && positionId > 0) {
        existingByPositionId.set(positionId, {
          ...(row as ExistingAutoGreetingJobRow),
          position_id: positionId,
        });
      }
    }

    const syncedIds = new Set<number>();

    for (const position of sourcePositions) {
      syncedIds.add(position.id);

      const existing = existingByPositionId.get(position.id);
      const requirements = buildRequirements(position);
      const nextHighlights =
        existing?.highlights && Array.isArray(existing.highlights) && existing.highlights.length > 0
          ? existing.highlights
          : buildHighlights(position);

      const nextStatus =
        position.status === "active"
          ? existing?.status || "active"
          : "archived";

      if (existing) {
        await client.query(
          `
            UPDATE ag_job_positions
            SET
              name = $1,
              department = $2,
              requirements = $3,
              highlights = $4,
              status = $5,
              created_by_id = $6,
              tenant_id = $7,
              is_global = $8,
              updated_at = NOW()
            WHERE id = $9
          `,
          [
            position.title,
            position.department,
            JSON.stringify(requirements),
            JSON.stringify(nextHighlights),
            nextStatus,
            position.userId,
            position.tenantId || null,
            position.isGlobal,
            existing.id,
          ]
        );
        continue;
      }

      await client.query(
        `
          INSERT INTO ag_job_positions (
            name, department, location, salary_min, salary_max,
            requirements, highlights, company_intro, company_size, company_industry,
            target_platforms, match_threshold,
            second_greeting_enabled, second_greeting_delay_hours,
            human_simulation, auto_reply_config,
            status, stats, position_id, created_by_id, tenant_id, is_global, created_by_name,
            created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10,
            $11, $12,
            $13, $14,
            $15, $16,
            $17, $18, $19, $20, $21, $22, $23,
            NOW(), NOW()
          )
        `,
        [
          position.title,
          position.department,
          "待补充",
          null,
          null,
          JSON.stringify(requirements),
          JSON.stringify(nextHighlights),
          null,
          null,
          null,
          JSON.stringify([]),
          60,
          false,
          24,
          JSON.stringify(DEFAULT_HUMAN_SIMULATION_CONFIG),
          JSON.stringify(DEFAULT_AUTO_REPLY_CONFIG),
          position.status === "active" ? "active" : "archived",
          JSON.stringify({
            totalGreeted: 0,
            totalReplied: 0,
            totalHighIntent: 0,
            totalResumeReceived: 0,
            totalContactReceived: 0,
            lastStatUpdate: new Date().toISOString(),
          }),
          position.id,
          position.userId,
          position.tenantId || null,
          position.isGlobal,
          null,
        ]
      );
    }

    if (syncedIds.size > 0) {
      await client.query(
        `
          UPDATE ag_job_positions
          SET status = 'archived', updated_at = NOW()
          WHERE position_id IS NOT NULL
            AND NOT (position_id = ANY($1::int[]))
        `,
        [[...syncedIds]]
      );
    } else {
      await client.query(
        `
          UPDATE ag_job_positions
          SET status = 'archived', updated_at = NOW()
          WHERE position_id IS NOT NULL
        `
      );
    }
  } finally {
    client.release();
  }
}

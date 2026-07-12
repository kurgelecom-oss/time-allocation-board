const NOTION_VERSION = "2025-09-03";

const CATEGORIES = [
  { key: "taylan-work", dataSourceId: "7e90f275-70d4-480a-b504-b8be3444b7f5", color: "#3b82f6" },
  { key: "taylan-personal", dataSourceId: "2b062576-79ee-4b7a-8acd-805aaf044f8b", color: "#f97316" },
  { key: "taylan-ecom", dataSourceId: "cd0e72dd-fb69-4599-95be-202ee1446770", color: "#22c55e" },
  { key: "nihal-home", dataSourceId: "52767310-b8e8-4827-bf66-ae08a9a68120", color: "#ec4899" },
  { key: "nihal-personal", dataSourceId: "e959c33a-968e-4da3-a1f5-f10e65acc094", color: "#a855f7" },
  { key: "nihal-ecom", dataSourceId: "dc07abb4-803e-4058-95f2-10dd473402fa", color: "#ef4444" },
  { key: "ansar-homeschool", dataSourceId: "588f40ab-4078-4767-982c-b50f9cd83f71", color: "#eab308" },
  { key: "ayah-homeschool", dataSourceId: "a2d13dcd-ce40-4899-b211-bba55eed3b50", color: "#92400e" },
];

function plainText(richText) {
  if (!Array.isArray(richText)) return "";
  return richText.map((t) => t.plain_text || "").join("");
}

async function queryDataSource(dataSourceId, token) {
  const pages = [];
  let cursor;
  do {
    const res = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cursor ? { start_cursor: cursor } : {}),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Notion API ${res.status}: ${text.slice(0, 300)}`);
    }
    const json = await res.json();
    pages.push(...(json.results || []));
    cursor = json.has_more ? json.next_cursor : undefined;
  } while (cursor);
  return pages;
}

function mapPageToBlock(page, category, color) {
  const props = page.properties || {};
  return {
    category,
    color,
    day: props.Day?.select?.name || "",
    start: plainText(props.Start?.rich_text),
    end: plainText(props.End?.rich_text),
    title: plainText(props.Block?.title) || "(untitled)",
    notes: plainText(props.Notes?.rich_text),
  };
}

exports.handler = async () => {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "NOTION_TOKEN is not configured" }),
    };
  }

  const outcomes = await Promise.allSettled(
    CATEGORIES.map(async (cat) => {
      const pages = await queryDataSource(cat.dataSourceId, token);
      return pages.map((page) => mapPageToBlock(page, cat.key, cat.color));
    })
  );

  const blocks = [];
  const errors = [];
  outcomes.forEach((outcome, i) => {
    const cat = CATEGORIES[i];
    if (outcome.status === "fulfilled") {
      blocks.push(...outcome.value);
    } else {
      errors.push({ category: cat.key, message: outcome.reason?.message || "Unknown error" });
    }
  });

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60",
    },
    body: JSON.stringify({
      blocks,
      errors,
      categories: CATEGORIES.map(({ key, color }) => ({ key, color })),
    }),
  };
};

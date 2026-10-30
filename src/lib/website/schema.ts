import { z } from "zod";
import { isSafeWebsiteLink, SECTION_ANCHORS } from "./links";
const text = (max: number) =>
  z
    .string()
    .max(max)
    .refine(
      (v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v),
      "Control characters are not allowed",
    );
const title = text(120).min(1);
const body = text(2000);
const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
export const linkSchema = z
  .object({
    id,
    label: title,
    href: z.string().refine(isSafeWebsiteLink, "Unsafe link"),
  })
  .strict();
const common = {
  enabled: z.boolean(),
  kicker: title,
  title,
  emphasis: text(120),
  description: body,
};
const hero = z
  .object({
    ...common,
    id: z.literal("hero"),
    type: z.literal("hero"),
    buttons: z.array(linkSchema).min(1).max(2),
  })
  .strict();
const products = z
  .object({
    ...common,
    id: z.literal("products"),
    type: z.literal("products"),
    items: z
      .array(
        z
          .object({
            id,
            title,
            body,
            icon: z.enum(["globe", "money", "repeat"]),
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict();
const process = z
  .object({
    ...common,
    id: z.literal("how"),
    type: z.literal("process"),
    items: z
      .array(z.object({ id, title, body, tag: title }).strict())
      .min(1)
      .max(12),
  })
  .strict();
const benefits = z
  .object({
    ...common,
    id: z.literal("why"),
    type: z.literal("benefits"),
    items: z
      .array(z.object({ id, text: body.min(1) }).strict())
      .min(1)
      .max(20),
    statementTitle: title,
    statementReference: title,
    statement: z
      .array(
        z
          .object({ id, label: title, value: title, highlight: z.boolean() })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict();
const closing = z
  .object({
    ...common,
    id: z.literal("closing-cta"),
    type: z.literal("closing"),
    buttons: z.array(linkSchema).min(1).max(2),
  })
  .strict();
export const sectionSchema = z.discriminatedUnion("type", [
  hero,
  products,
  process,
  benefits,
  closing,
]);
const seo = z.object({ title, description: body }).strict();
const testimonial = z
  .object({
    enabled: z.boolean(),
    quote: body,
    initials: text(8),
    name: title,
    role: title,
  })
  .strict();
export const authPageSchema = z
  .object({
    seo,
    marketing: z
      .object({
        enabled: z.boolean(),
        title,
        emphasis: text(120),
        body,
        testimonial,
      })
      .strict(),
    greeting: title,
    subtitle: body,
    backLabel: title,
    submitLabel: title,
    footerPrompt: title,
    footerLinkLabel: title,
    forgotLabel: title,
    staffTitle: title,
    staffHint: body,
  })
  .strict();
export const websiteSchema = z
  .object({
    schemaVersion: z.literal(1),
    site: z
      .object({
        companyName: title,
        logoAssetId: z.string().uuid().nullable(),
        iconAssetId: z.string().uuid().nullable(),
        logoAlt: title,
      })
      .strict(),
    landing: z
      .object({
        seo,
        navigation: z.array(linkSchema).max(20),
        loginLabel: title,
        applyLabel: title,
        sections: z.array(sectionSchema).min(1).max(5),
        footer: z
          .object({
            description: body,
            copyright: title,
            columns: z
              .array(
                z
                  .object({
                    id,
                    title,
                    links: z
                      .array(
                        z
                          .object({
                            id,
                            label: title,
                            href: z
                              .string()
                              .refine(isSafeWebsiteLink)
                              .nullable(),
                          })
                          .strict(),
                      )
                      .max(20),
                  })
                  .strict(),
              )
              .max(6),
          })
          .strict(),
      })
      .strict(),
    login: authPageSchema,
    register: authPageSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const sections = value.landing.sections;
    if (sections[0]?.type !== "hero" || !sections[0].enabled)
      ctx.addIssue({
        code: "custom",
        path: ["landing", "sections"],
        message: "Enabled hero must be first",
      });
    const seen = new Set<string>();
    for (const [index, section] of sections.entries()) {
      if (seen.has(section.id))
        ctx.addIssue({
          code: "custom",
          path: ["landing", "sections", index, "id"],
          message: "Duplicate section",
        });
      seen.add(section.id);
    }
    const validateIds = (
      items: Array<{ id: string }>,
      path: (string | number)[],
    ) => {
      if (new Set(items.map((i) => i.id)).size !== items.length)
        ctx.addIssue({ code: "custom", path, message: "Duplicate item IDs" });
    };
    validateIds(value.landing.navigation, ["landing", "navigation"]);
    validateIds(value.landing.footer.columns, ["landing", "footer", "columns"]);
    sections.forEach((section, index) => {
      if ("items" in section)
        validateIds(section.items, ["landing", "sections", index, "items"]);
      if ("buttons" in section)
        validateIds(section.buttons, ["landing", "sections", index, "buttons"]);
      if ("statement" in section)
        validateIds(section.statement, [
          "landing",
          "sections",
          index,
          "statement",
        ]);
    });
    value.landing.footer.columns.forEach((column, index) =>
      validateIds(column.links, [
        "landing",
        "footer",
        "columns",
        index,
        "links",
      ]),
    );
    const links = [
      ...value.landing.navigation,
      ...value.landing.footer.columns.flatMap((c) => c.links),
      ...sections.flatMap((s) => ("buttons" in s ? s.buttons : [])),
    ];
    const anchors = new Set(
      sections.filter((s) => s.enabled).map((s) => `#${SECTION_ANCHORS[s.id]}`),
    );
    for (const link of links)
      if (link.href?.startsWith("#") && !anchors.has(link.href))
        ctx.addIssue({
          code: "custom",
          path: ["landing"],
          message: `Link ${link.href} targets a hidden section`,
        });
  });
export type WebsiteContent = z.infer<typeof websiteSchema>;
export type WebsiteSection = z.infer<typeof sectionSchema>;
export type AuthPageContent = z.infer<typeof authPageSchema>;
export const publicAssetSchema = z
  .object({
    id: z.string().uuid(),
    publicPath: z
      .string()
      .regex(
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/[a-f0-9]{64}\.(png|jpg|webp)$/,
      ),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    width: z.number().int().positive().max(16000000),
    height: z.number().int().positive().max(16000000),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.width * value.height > 16000000)
      ctx.addIssue({ code: "custom", message: "Image exceeds pixel limit" });
    if (value.publicPath.split("/")[0] !== value.id)
      ctx.addIssue({
        code: "custom",
        path: ["publicPath"],
        message: "Asset path identity mismatch",
      });
    const ext =
      value.mimeType === "image/jpeg"
        ? "jpg"
        : value.mimeType === "image/png"
          ? "png"
          : "webp";
    if (!value.publicPath.endsWith(`.${ext}`))
      ctx.addIssue({
        code: "custom",
        path: ["mimeType"],
        message: "MIME and file extension mismatch",
      });
  });
export type PublicAsset = z.infer<typeof publicAssetSchema>;
export function collectAssetIds(value: WebsiteContent): string[] {
  return [
    ...new Set(
      [value.site.logoAssetId, value.site.iconAssetId].filter(
        (v): v is string => Boolean(v),
      ),
    ),
  ];
}
export const publicationSchema = z
  .object({
    content: websiteSchema,
    assets: z.array(publicAssetSchema).max(50),
  })
  .strict()
  .superRefine((value, ctx) => {
    const expected = collectAssetIds(value.content);
    const ids = value.assets.map((a) => a.id);
    if (
      new Set(ids).size !== ids.length ||
      expected.length !== ids.length ||
      expected.some((id) => !ids.includes(id))
    )
      ctx.addIssue({
        code: "custom",
        path: ["assets"],
        message: "Asset manifest does not match content references",
      });
  });

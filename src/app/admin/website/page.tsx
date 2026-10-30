import { WebsiteEditor } from "@/components/admin/website/WebsiteEditor";
import { requireModulePermission } from "@/lib/permissions/server";

export default async function WebsiteContentPage() {
  await requireModulePermission("website_content", "view");
  return <WebsiteEditor />;
}

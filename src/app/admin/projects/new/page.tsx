import { ProjectEditor } from "@/components/admin/project-editor";

// 路由只决定编辑模式，减少两个页面的行为差异。
export default function NewProjectPage() {
  return <ProjectEditor />;
}

import { ProjectEditor } from "@/components/admin/project-editor";

// 项目标识由路由传递，表单统一负责加载和保存。
export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProjectEditor id={id} />;
}

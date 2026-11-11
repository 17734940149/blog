import { PostEditor } from "@/components/admin/post-editor";

// 路由只负责传递标识，读取和保存状态由同一个编辑器维护。
export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PostEditor id={id} />;
}

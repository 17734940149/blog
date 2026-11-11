import { PostEditor } from "@/components/admin/post-editor";

// 新建与编辑复用表单，避免发布规则出现两套实现。
export default function NewPostPage() {
  return <PostEditor />;
}

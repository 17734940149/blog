// 通过稳定占位保留阅读区域，路由切换时不让布局突然收缩。
export default function Loading() {
  return (
    <main
      id="main"
      className="container inner-page loading-page"
      aria-busy="true"
    >
      <div className="skeleton skeleton-heading" />
      <div className="skeleton skeleton-line" />
      {[0, 1, 2].map((item) => (
        <div className="skeleton skeleton-post" key={item} />
      ))}
    </main>
  );
}

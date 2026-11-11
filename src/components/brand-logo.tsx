// 导航和后台共用图标中的字母路径；版本参数使已打开的浏览器也能加载重绘后的标志。
export function BrandLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width="40"
      height="40"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <use href="/icon.svg?gy=3#gy-wordmark-v3" />
    </svg>
  );
}

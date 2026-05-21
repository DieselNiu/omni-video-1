import type { SVGProps } from 'react';

export function YandexIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={18}
      height={18}
      viewBox="0 0 48 48"
      {...props}
    >
      <title>Yandex</title>
      <circle cx={24} cy={24} r={24} fill="#FC3F1D" />
      <text
        x="24"
        y="24"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="32"
        fontWeight="700"
        fill="#FFFFFF"
      >
        Я
      </text>
    </svg>
  );
}

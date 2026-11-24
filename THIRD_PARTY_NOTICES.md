# 第三方许可与数据归属

下列为构建时生产依赖树。原始许可文本位于 `third-party-licenses/`，不改变各项目原有版权。Electron/Chromium自身的许可随安装目录附带。

| 包 | 版本 | 许可 | 文本 |
|---|---|---|---|
| @fontsource-variable/inter | 5.3.0 | OFL-1.1 | 已包含 |
| 3d-tiles-renderer | 0.4.28 | Apache-2.0 | 已包含 |
| framer-motion | 11.18.2 | MIT | 已包含 |
| lucide-react | 0.460.0 | ISC | 已包含 |
| react-dom | 18.3.1 | MIT | 已包含 |
| react | 18.3.1 | MIT | 已包含 |
| three | 0.169.0 | MIT | 已包含 |
| @mapbox/vector-tile | 2.0.5 | BSD-3-Clause | 已包含 |
| pbf | 4.0.2 | BSD-3-Clause | 已包含 |
| pmtiles | 4.5.0 | BSD-3-Clause | 见上游包 |
| motion-dom | 11.18.1 | MIT | 已包含 |
| motion-utils | 11.18.1 | MIT | 已包含 |
| tslib | 2.8.1 | 0BSD | 已包含 |
| loose-envify | 1.4.0 | MIT | 已包含 |
| scheduler | 0.23.2 | MIT | 已包含 |
| @mapbox/point-geometry | 1.1.0 | ISC | 已包含 |
| @types/geojson | 7946.0.16 | MIT | 已包含 |
| resolve-protobuf-schema | 2.1.0 | MIT | 已包含 |
| fflate | 0.8.3 | MIT | 已包含 |
| js-tokens | 4.0.0 | MIT | 已包含 |
| protocol-buffers-schema | 3.6.1 | MIT | 已包含 |

## 地图数据

- © OpenStreetMap contributors，ODbL 1.0：https://www.openstreetmap.org/copyright 。陆家嘴街区为公开OSM数据的简化派生，非实时数据；源数据与简化坐标在 `src/assets/geo/osm-lujiazui.json`，由公开Overpass接口取得。
- Natural Earth 1:110m land，公有领域：https://www.naturalearthdata.com/about/terms-of-use/ 。

程序代码MIT许可不替代地图的ODbL义务或字体OFL条款。

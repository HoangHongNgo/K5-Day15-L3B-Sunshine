// Synthetic UI fixtures, drawn from primitives. No source photos or floor plans.
// Reproduce with: node scripts/render-demo-images.mjs (from web/).
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'

const shell = (content) => `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
<defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#213657"/><stop offset="1" stop-color="#566b85"/></linearGradient></defs>
<rect width="640" height="360" fill="url(#sky)"/>${content}
<rect x="20" y="20" width="162" height="32" rx="16" fill="#152238"/>
<text x="101" y="41" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#fff">MINH HOẠ · MOCK</text></svg>`
const fixtures = {
  campus: shell(`<circle cx="536" cy="88" r="38" fill="#e5bd76"/><path d="M0 267Q140 227 295 265T640 252V360H0" fill="#3b5b51"/>
    <path d="M254 360L294 280H348L394 360" fill="#b3b3a7"/>
    <rect x="157" y="158" width="326" height="128" rx="3" fill="#d6d6ce"/><rect x="230" y="125" width="180" height="161" fill="#e7e4d9"/>
    <path d="M216 125L320 76L424 125Z" fill="#c4232a"/>
    ${[180,220,268,308,348,397,437].map(x => `<rect x="${x}" y="176" width="18" height="27" rx="8" fill="#35426e"/><rect x="${x}" y="222" width="18" height="27" rx="8" fill="#35426e"/>`).join('')}
    <rect x="303" y="237" width="35" height="49" rx="16" fill="#35426e"/>
    ${[90,530,570].map(x => `<rect x="${x}" y="244" width="7" height="48" fill="#a5a097"/><circle cx="${x+3}" cy="224" r="30" fill="#688976"/>`).join('')}`),
  classroom: shell(`<path d="M0 0H640L526 255H114Z" fill="#e5dfd3"/><path d="M0 0L114 255V360H0Z" fill="#a8bbc1"/><path d="M640 0L526 255V360H640Z" fill="#b6b1a8"/>
    <path d="M114 255H526L640 360H0Z" fill="#8f8880"/><rect x="215" y="95" width="210" height="112" rx="6" fill="#354b4b"/>
    <path d="M249 139H388M249 160H359M249 181H376" stroke="#9cb9ae" stroke-width="4"/>
    ${[154,280,406].map(x => `<rect x="${x}" y="242" width="84" height="19" rx="7" fill="#c89460"/><path d="M${x+10} 261V293M${x+74} 261V293" stroke="#35426e" stroke-width="8"/><rect x="${x+12}" y="273" width="60" height="30" rx="10" fill="#35426e"/>`).join('')}
    <rect x="32" y="87" width="51" height="122" rx="4" fill="#d8eef0"/><rect x="555" y="76" width="44" height="133" rx="4" fill="#d8eef0"/>`),
  aerial: shell(`<circle cx="528" cy="72" r="34" fill="#e5bd76"/><path d="M0 192L143 87L282 226L427 110L640 232V360H0" fill="#526d68"/>
    <path d="M0 234L168 172L326 286L456 205L640 260V360H0" fill="#71887a"/>
    <path d="M0 282Q150 235 300 310T640 294V360H0" fill="#a9bdad"/>
    <path d="M430 247Q345 285 408 314T396 360H474Q520 312 446 297T491 248Z" fill="#6fadc1"/>
    <path d="M270 54Q285 42 300 54M310 70Q325 58 340 70" fill="none" stroke="#d8e2e4" stroke-width="3"/>`),
}
await mkdir('public/images', { recursive: true })
for (const [name, svg] of Object.entries(fixtures)) {
  await sharp(Buffer.from(svg)).webp({ quality: 85 }).toFile(`public/images/${name}.webp`)
}
console.log('Created 3 synthetic UI illustrations (not VinUni photos or map data).')

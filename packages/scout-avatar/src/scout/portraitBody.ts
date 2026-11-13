/** Scout's shoulders and neckerchief, turned with his head; they run off the bottom of the frame. 200×200 box. */
import type { BadgeColors } from './badgeArt';

export function bodyMarkup(c: BadgeColors) {
  return [
    `<path d="M24 210Q26 162 72 152H150Q190 158 192 210Z" fill="${c.shell}"/>`,
    `<path d="M24 210Q26 162 72 152H84Q58 166 58 210Z" fill="${c.shade}"/>`,
    `<path d="M66 154Q108 160 160 154L156 162Q108 168 70 162Z" fill="${c.side}"/>`,
    `<path d="M88 152L122 196L156 152Z" fill="${c.orange}"/>`,
    `<path d="M88 152L122 196L112 152Z" fill="${c.orangeDark}"/>`,
    `<circle cx="122" cy="161" r="8" fill="${c.orangeDark}"/><circle cx="124" cy="159" r="3" fill="${c.orange}"/>`,
  ].join('');
}

export const splitByKK = content => (content > 999 ? content.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : content);

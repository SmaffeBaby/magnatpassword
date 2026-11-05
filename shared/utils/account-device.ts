export function describeDevice(userAgent: string, platform = '') {
  const agent = userAgent.slice(0, 2000)
  const os = /android/i.test(agent) ? 'Android' : /iphone|ipad|ipod/i.test(agent) || /ipad/i.test(platform) ? 'iOS'
    : /windows/i.test(agent) ? 'Windows' : /mac/i.test(agent + platform) ? 'macOS' : /linux/i.test(agent) ? 'Linux' : 'Неизвестное устройство'
  const browser = /edg\//i.test(agent) ? 'Edge' : /opr\//i.test(agent) ? 'Opera' : /firefox|fxios/i.test(agent) ? 'Firefox'
    : /chrome|crios/i.test(agent) ? 'Chrome' : /safari/i.test(agent) ? 'Safari' : 'Браузер'
  return { platform: os, browser }
}

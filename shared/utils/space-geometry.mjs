/** Resize in board coordinates, keeping the opposite corner fixed. */
export function resizeFrame(rect, corner, dx, dy) {
 const west=corner.includes('w'), north=corner.includes('n')
 const width=Math.max(160,Math.min(2000,rect.width+(west?-dx:dx)))
 const height=Math.max(100,Math.min(2000,rect.height+(north?-dy:dy)))
 return {width,height,x:west?rect.x+rect.width-width:rect.x,y:north?rect.y+rect.height-height:rect.y}
}

/** Distance from a board point to a finite ink segment. */
export function inkDistance(point, a, b) {
 const dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy
 const t=den?Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/den)):0
 return Math.hypot(point[0]-a[0]-t*dx,point[1]-a[1]-t*dy)
}

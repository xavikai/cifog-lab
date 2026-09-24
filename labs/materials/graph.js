export const DEFAULT_LINKS = Object.freeze({
 'mapping:input':'coordinates:uv',
 'color:vector':'mapping:vector', 'rough:vector':'mapping:vector', 'normalTex:vector':'mapping:vector',
 'bsdf:base':'color:color', 'bsdf:roughness':'rough:color', 'normal:color':'normalTex:color',
 'bsdf:normal':'normal:normal', 'output:surface':'bsdf:bsdf'
});
export const COORDINATES = ['generated','normal','uv','object','camera','window','reflection'];
const coordinateOutputs=COORDINATES.map(name=>`coordinates:${name}`);
export const OUTPUTS = Object.freeze({
 ...Object.fromEntries(coordinateOutputs.map(key=>[key,'vector'])),
 'mapping:vector':'vector', 'color:color':'color', 'rough:color':'color', 'normalTex:color':'color',
 'normal:normal':'vector', 'bsdf:bsdf':'shader'
});
export const INPUTS = Object.freeze({
 'mapping:input':coordinateOutputs,
 'mapping:location':coordinateOutputs, 'mapping:rotation':coordinateOutputs, 'mapping:scale':coordinateOutputs,
 'color:vector':['mapping:vector',...coordinateOutputs], 'rough:vector':['mapping:vector',...coordinateOutputs], 'normalTex:vector':['mapping:vector',...coordinateOutputs],
 'normal:color':['color:color','rough:color','normalTex:color'],
 'bsdf:base':['color:color','rough:color','normalTex:color'],
 'bsdf:roughness':['color:color','rough:color','normalTex:color'],
 'bsdf:metallic':['color:color','rough:color','normalTex:color'],
 'bsdf:normal':['normal:normal'], 'output:surface':['bsdf:bsdf']
});
export function coordinateRoute(links,node){
 const output=links[`${node}:vector`];
 const mapped=output==='mapping:vector';
 const source=mapped?links['mapping:input']:output;
 return {mapped,source:source?COORDINATES.indexOf(source.split(':')[1]):mapped?-1:2};
}
export function canConnect(from,to){return Boolean(INPUTS[to]?.includes(from));}
export function connect(links,from,to){if(!canConnect(from,to))return false;links[to]=from;return true;}
export function textureNodeFor(links,input){const from=links[input];return from?.endsWith(':color')?from.split(':')[0]:null;}
export function resolveGraph(links){
 return {
  visible: links['output:surface']==='bsdf:bsdf',
  base: textureNodeFor(links,'bsdf:base'),
  rough: textureNodeFor(links,'bsdf:roughness'),
  metallic: textureNodeFor(links,'bsdf:metallic'),
  normal: links['bsdf:normal']==='normal:normal'?textureNodeFor(links,'normal:color'):null
 };
}

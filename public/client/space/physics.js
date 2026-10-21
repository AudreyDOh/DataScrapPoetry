import {Vector3} from '../../vendor/three/three.module.js';
const EPS=1e-8;
export function closestSegments(a,b,c,d){
  const u=b.clone().sub(a),v=d.clone().sub(c),w=a.clone().sub(c),A=u.dot(u),B=u.dot(v),C=v.dot(v),D=u.dot(w),E=v.dot(w),den=A*C-B*B;
  let s=den>EPS?Math.max(0,Math.min(1,(B*E-C*D)/den)):0;
  let t=C>EPS?(B*s+E)/C:0;
  if(t<0){t=0;s=A>EPS?Math.max(0,Math.min(1,-D/A)):0;}else if(t>1){t=1;s=A>EPS?Math.max(0,Math.min(1,(B-D)/A)):0;}
  return {s,t,p:a.clone().addScaledVector(u,s),q:c.clone().addScaledVector(v,t)};
}
export class RopeWorld {
  constructor({damping=.985,strandCollisions=true,collisionStrength=.85}={}){this.collisionStrength=collisionStrength;this.damping=damping;this.strandCollisions=strandCollisions;this.settleRemaining=0;this.ropes=[];this.panels=[];this.radius=.025;this.contacts=0;this.time=0;}
  add(a,b,options={}){
    const from=a(),to=b(),distance=from.distanceTo(to),n=Math.max(5,Math.min(42,Math.ceil(distance/.22)));
    const p=Array.from({length:n+1},(_,i)=>{const t=i/n;return from.clone().lerp(to,t).add(new Vector3(0,-Math.sin(t*Math.PI)*Math.max(.05,distance*.12),Math.sin(t*Math.PI)*.10));});
    const rest=p.slice(1).map((v,i)=>v.distanceTo(p[i])*(options.elastic?1.10:1.015));
    const rope={a,b,p,old:p.map(v=>v.clone()),rest,total:rest.reduce((a,b)=>a+b,0),touching:new Set(),baseRest:rest.slice(),lastA:from.clone(),lastB:to.clone(),...options};this.ropes.push(rope);return rope;
  }
  sleep(){this.settleRemaining=0;for(const r of this.ropes)r.old.forEach((p,i)=>p.copy(r.p[i]));}
  tick(dt,moved=false){
    if(moved)this.settleRemaining=1.1;
    if(this.settleRemaining<=0)return false;
    // Same-page paths are visual curves, not colliding ropes.
    for(const r of this.ropes){if(r.physical!==false)continue;const a=r.a(),b=r.b(),distance=a.distanceTo(b);for(let i=0;i<r.p.length;i++){const t=i/(r.p.length-1);const target=a.clone().lerp(b,t).add(new Vector3(0,-Math.sin(t*Math.PI)*Math.max(.035,distance*.10),Math.sin(t*Math.PI)*.03));r.p[i].lerp(target,1-Math.exp(-18*dt));}this.pins(r);}
    this.step(dt);this.settleRemaining-=dt;
    if(this.settleRemaining<=0)this.sleep();
    return true;
  }
  soften(r,dt){
    if(!r.elastic)return;
    const a=r.a(),b=r.b(),da=a.clone().sub(r.lastA),db=b.clone().sub(r.lastB);
    // Carry the curve with its anchors instead of yanking only its end particles.
    for(let i=1;i<r.p.length-1;i++){const t=i/(r.p.length-1),shift=da.clone().lerp(db,t);r.p[i].add(shift);r.old[i].add(shift);}
    r.lastA.copy(a);r.lastB.copy(b);
    const base=r.baseRest.reduce((sum,v)=>sum+v,0),distance=a.distanceTo(b);
    const target=Math.max(base,distance*1.16),current=r.total;
    // Add slack readily, let it retract slowly, and always retain a little give.
    const total=Math.max(distance*1.06,current+(target-current)*(1-Math.exp(-(target>current?9:1.4)*dt)));
    for(let i=0;i<r.rest.length;i++)r.rest[i]=r.baseRest[i]*total/base;
    r.total=total;
  }
  pins(r){r.p[0].copy(r.a());r.p.at(-1).copy(r.b());}
  step(dt=1/90){
    this.time+=dt;this.contacts=0;
    for(const r of this.ropes){if(r.physical===false)continue;r.touching.clear();this.soften(r,dt);this.pins(r);for(let i=1;i<r.p.length-1;i++){const p=r.p[i],velocity=p.clone().sub(r.old[i]).multiplyScalar(this.damping).clampLength(0,.09);r.old[i].copy(p);p.add(velocity);p.y-=1.7*dt*dt;}}
    for(let iteration=0;iteration<6;iteration++){
      for(const r of this.ropes){if(r.physical===false)continue;this.pins(r);for(let j=0;j<r.rest.length;j++){const a=r.p[j],b=r.p[j+1],delta=b.clone().sub(a),length=delta.length();if(length<EPS)continue;const correction=delta.multiplyScalar((r.elastic?Math.max(0,length-r.rest[j]):length-r.rest[j])/length*(r.elastic?.38:.92)),wa=j===0?0:1,wb=j+1===r.p.length-1?0:1;if(wa+wb){a.addScaledVector(correction,wa/(wa+wb));b.addScaledVector(correction,-wb/(wa+wb));}}}
      for(const r of this.ropes){if(!r.elastic)continue;const smooth=r.p.map(p=>p.clone());for(let i=1;i<r.p.length-1;i++)r.p[i].lerp(smooth[i-1].clone().add(smooth[i+1]).multiplyScalar(.5),.12);}
      this.pageCollisions();if(this.strandCollisions&&iteration%2===1)this.ropeCollisions();
    }
    for(const r of this.ropes)this.pins(r);
  }
  pageCollisions(){
    for(const panel of this.panels){
      const inv=panel.quaternion.clone().invert(),halfX=panel.width/2,halfY=panel.height/2,thickness=.035;
      for(const r of this.ropes){if(r.physical===false)continue;for(let i=1;i<r.p.length-1;i++){
        // Endpoints emerge from the surface; all other particles collide.
        if((i===1&&r.fromPage===panel.id)||(i===r.p.length-2&&r.toPage===panel.id))continue;
        const local=r.p[i].clone().sub(panel.position).applyQuaternion(inv),old=r.old[i].clone().sub(panel.position).applyQuaternion(inv);
        if(Math.abs(local.x)>halfX+this.radius||Math.abs(local.y)>halfY+this.radius)continue;
        const crossed=old.z*local.z<0&&Math.abs(old.x)<halfX&&Math.abs(old.y)<halfY;
        if(Math.abs(local.z)<thickness+this.radius||crossed){
          const side=old.z>=0?1:-1;local.z=side*(thickness+this.radius);r.p[i].copy(local.applyQuaternion(panel.quaternion).add(panel.position));
          // Tangential friction lets a strand stay caught, then slide around an edge.
          r.old[i].lerp(r.p[i],.12);r.touching.add(panel.id);this.contacts++;
        }
      }}
    }
  }
  ropeCollisions(){
    // Segment capsules, with a spatial hash to avoid testing every pair of ropes.
    const buckets=new Map(),segments=[],cell=.45;
    for(let ri=0;ri<this.ropes.length;ri++){const r=this.ropes[ri];if(r.physical===false)continue;for(let i=0;i<r.p.length-1;i++){
      const a=r.p[i],b=r.p[i+1],id=segments.length;segments.push({r,ri,i,a,b});
      const min=[Math.min(a.x,b.x),Math.min(a.y,b.y),Math.min(a.z,b.z)].map(v=>Math.floor((v-this.radius)/cell)),max=[Math.max(a.x,b.x),Math.max(a.y,b.y),Math.max(a.z,b.z)].map(v=>Math.floor((v+this.radius)/cell));
      // Stretch is bounded during dragging; guard corrupted or pathological input.
      if(max.some((v,k)=>v-min[k]>8))continue;
      for(let x=min[0];x<=max[0];x++)for(let y=min[1];y<=max[1];y++)for(let z=min[2];z<=max[2];z++){const key=`${x},${y},${z}`,list=buckets.get(key)||[];list.push(id);buckets.set(key,list);}
    }}
    const tested=new Set();
    for(const bucket of buckets.values())for(let a=0;a<bucket.length;a++)for(let b=a+1;b<bucket.length;b++){
      const ia=bucket[a],ib=bucket[b],key=ia*segments.length+ib;if(tested.has(key))continue;tested.add(key);
      const s=segments[ia],t=segments[ib];if(s.ri===t.ri&&Math.abs(s.i-t.i)<=2)continue;
      // Strands meeting at the same source word are joined, not colliding.
      if((s.i===0&&t.i===0&&s.a.distanceToSquared(t.a)<.004)||(s.i===s.r.p.length-2&&t.i===t.r.p.length-2&&s.b.distanceToSquared(t.b)<.004))continue;
      const hit=closestSegments(s.a,s.b,t.a,t.b),delta=hit.p.sub(hit.q),distance=delta.length(),diameter=this.radius*2;
      if(distance>=diameter)continue;
      if(distance<EPS){delta.crossVectors(s.b.clone().sub(s.a),t.b.clone().sub(t.a));if(delta.lengthSq()<EPS)delta.set(0,0,1);delta.normalize();}else delta.divideScalar(distance);
      const weights=[s.i===0?0:1-hit.s,s.i+1===s.r.p.length-1?0:hit.s,t.i===0?0:1-hit.t,t.i+1===t.r.p.length-1?0:hit.t];const sum=weights.reduce((v,w)=>v+w*w,0);if(sum<EPS)continue;
      const correction=Math.min(.012,(diameter-distance)*this.collisionStrength/sum);
      [s.a,s.b,t.a,t.b].forEach((p,i)=>p.addScaledVector(delta,correction*weights[i]*(i<2?1:-1)));this.contacts++;
    }
  }
  dragLimit(panel,desired){
    let delta=desired.clone().sub(panel.position).clampLength(0,.055);
    for(let iteration=0;iteration<5;iteration++){
      let allowed=true;
      for(const r of this.ropes){if(r.physical===false||r.elastic)continue;if(r.fromPage!==panel.id&&r.toPage!==panel.id&&!r.touching.has(panel.id))continue;
        let length=0;for(let i=0;i<r.p.length-1;i++){let a=r.p[i],b=r.p[i+1];if(i===0&&r.fromPage===panel.id)a=r.a().add(delta);if(i+1===r.p.length-1&&r.toPage===panel.id)b=r.b().add(delta);if(r.touching.has(panel.id)){const inv=panel.quaternion.clone().invert();for(const [point,isA] of [[a,true],[b,false]]){const local=point.clone().sub(panel.position).applyQuaternion(inv);if(Math.abs(local.x)<panel.width/2&&Math.abs(local.y)<panel.height/2&&Math.abs(local.z)<.09){if(isA&&i!==0)a=point.clone().add(delta);if(!isA&&i+1!==r.p.length-1)b=point.clone().add(delta);}}}length+=a.distanceTo(b);}
        const current=r.p.slice(1).reduce((sum,p,i)=>sum+p.distanceTo(r.p[i]),0);
        if(length>r.total*1.09&&length>current+.0005){allowed=false;break;}
      }
      if(allowed)return panel.position.clone().add(delta);delta.multiplyScalar(.35);
    }
    return panel.position.clone().add(delta);
  }
}

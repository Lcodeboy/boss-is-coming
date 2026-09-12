import { _decorator, Component, Node, resources, Sprite, SpriteFrame, Tween, tween, UIOpacity, Vec3, warn } from 'cc';
import { FAILURE_HEAD_REACTION, HeadReactionKeyframe, InspectionAnimationLayout, InspectionAnimationTimeline, SUCCESS_HEAD_REACTION } from '../core/InspectionAnimation';
import { createUiNode, requireTransform } from './UIFactory';
const { ccclass } = _decorator;
export const BOSS_INSPECTOR_HEAD_RESOURCE_PATH = 'characters/boss-inspector-head/spriteFrame';
export const BOSS_INSPECTOR_BODY_RESOURCE_PATH = 'characters/boss-inspector-body/spriteFrame';
const HEAD_NECK_ANCHOR_Y = (1536 - 806) / 1536;
interface Request { readonly passed:boolean; readonly reducedMotion:boolean; readonly timeline:InspectionAnimationTimeline; }

@ccclass('BossInspectionActor')
export class BossInspectionActor extends Component {
    private _body:Node|null=null; private _head:Node|null=null; private _opacity:UIOpacity|null=null;
    private _layout:InspectionAnimationLayout|null=null; private _request:Request|null=null;
    private _loaded=0; private _paused=false; private _disposed=false; private _headY=0;
    public initialize(layout:InspectionAnimationLayout):void {
        this._layout=layout; requireTransform(this.node).setContentSize(layout.actorWidth,layout.actorHeight);
        this.node.setPosition(layout.actorX,layout.actorY); if(this._body) return;
        this._body=createUiNode(this.node,'Body',layout.actorWidth,layout.actorHeight);
        this._head=createUiNode(this.node,'Head',layout.actorWidth,layout.actorHeight);
        requireTransform(this._head).setAnchorPoint(.5,HEAD_NECK_ANCHOR_Y);
        this._headY=(HEAD_NECK_ANCHOR_Y-.5)*layout.actorHeight; this._head.setPosition(0,this._headY);
        this.attach(this._body,BOSS_INSPECTOR_BODY_RESOURCE_PATH); this.attach(this._head,BOSS_INSPECTOR_HEAD_RESOURCE_PATH);
        this._opacity=this.node.addComponent(UIOpacity); this._opacity.opacity=0;
    }
    public play(passed:boolean,reducedMotion:boolean,timeline:InspectionAnimationTimeline):void {
        this._request={passed,reducedMotion,timeline}; if(this._loaded===2) this.startSequence(this._request);
    }
    public setPaused(paused:boolean):void {
        if(paused===this._paused)return; this._paused=paused;
        if(paused){const opacity=this._opacity?.opacity??255;this.stop();this.rest(opacity);}
    }
    public playResultReaction(passed:boolean,reducedMotion:boolean):void {
        if(reducedMotion||this._paused)return;this.restoreLayers();this.outcome(passed,0);
    }
    public reset():void { this._request=null; this._paused=false; this.stop(); this.rest(0); }
    protected override onDisable():void { this.stop(); this.restoreLayers(); }
    protected override onDestroy():void {
        this._disposed=true; this._request=null; this.stop(); this._body=null; this._head=null; this._opacity=null; this._layout=null;
    }
    private attach(node:Node,path:string):void {
        const sprite=node.addComponent(Sprite); sprite.type=Sprite.Type.SIMPLE; sprite.sizeMode=Sprite.SizeMode.CUSTOM; sprite.trim=false;
        resources.load(path,SpriteFrame,(error,frame)=>{
            if(this._disposed)return; if(error){warn(`Boss检查角色分层资源加载失败：${path}`);return;}
            sprite.spriteFrame=frame; this._loaded++; if(this._loaded===2&&this._request)this.startSequence(this._request);
        });
    }
    private startSequence(request:Request):void {
        const layout=this._layout,opacity=this._opacity,head=this._head,body=this._body;
        if(!layout||!opacity||!head||!body)return; this.stop(); this.restoreLayers();
        if(this._paused){this.rest(opacity.opacity);return;}
        if(request.reducedMotion){this.rest(0);tween(opacity).to(.18,{opacity:255}).start();if(this._paused)Tween.pauseAllByTarget(opacity);return;}
        const rest=new Vec3(layout.actorX,layout.actorY);
        this.node.setPosition(layout.actorEntryX,layout.actorY);this.node.setScale(.93,.93,1);this.node.angle=-7;opacity.opacity=0;
        tween(opacity).to(.14,{opacity:255}).start();
        tween(this.node)
            .to(.16,{position:new Vec3(layout.actorX+150,layout.actorY+18),scale:new Vec3(.98,.98,1),angle:5},{easing:'quadOut'})
            .to(.14,{position:new Vec3(layout.actorX+48,layout.actorY-10),scale:new Vec3(1.03,1.03,1),angle:-3},{easing:'quadOut'})
            .to(.16,{position:rest,scale:new Vec3(1.015,1.015,1),angle:1},{easing:'backOut'})
            .to(.12,{scale:Vec3.ONE,angle:0},{easing:'quadOut'}).start();
        tween(body).delay(.58).to(.16,{position:new Vec3(-8,-3),scale:new Vec3(1.012,1.012,1)})
            .to(.07,{position:new Vec3(-6,0)}).to(.07,{position:new Vec3(-9,-4)}).to(.07,{position:new Vec3(-6,0)})
            .to(.26,{position:Vec3.ZERO,scale:Vec3.ONE},{easing:'quadOut'}).start();
        tween(head).delay(.58).to(.16,{position:new Vec3(-10,this._headY-5),scale:new Vec3(1.012,1.012,1)})
            .to(.07,{angle:2}).to(.07,{angle:-2}).to(.07,{angle:2})
            .to(.26,{position:new Vec3(0,this._headY),scale:Vec3.ONE,angle:0},{easing:'quadOut'}).start();
    }
    private outcome(passed:boolean,delay:number):void {
        const head=this._head,body=this._body;if(!head||!body)return;
        let sequence=tween(head).delay(delay);
        for(const frame of (passed?SUCCESS_HEAD_REACTION:FAILURE_HEAD_REACTION))sequence=this.frame(sequence,frame);
        sequence.start();
        tween(body).delay(delay).to(.18,{position:passed?new Vec3(0,-3):new Vec3(-2,2)},{easing:'quadOut'})
            .to(.24,{position:Vec3.ZERO},{easing:'quadOut'}).start();
    }
    private frame(sequence:Tween<Node>,frame:HeadReactionKeyframe):Tween<Node> {
        return sequence.to(frame.seconds,{position:new Vec3(frame.x,this._headY+frame.y),scale:new Vec3(1,frame.scaleY,1),angle:frame.angle},{easing:'quadInOut'});
    }
    private restoreLayers():void {
        this._body?.setPosition(Vec3.ZERO);this._body?.setScale(Vec3.ONE);if(this._body)this._body.angle=0;
        this._head?.setPosition(0,this._headY);this._head?.setScale(Vec3.ONE);if(this._head)this._head.angle=0;
    }
    private rest(opacity:number):void {
        if(this._layout)this.node.setPosition(this._layout.actorX,this._layout.actorY);
        this.node.setScale(Vec3.ONE);this.node.angle=0;this.restoreLayers();if(this._opacity)this._opacity.opacity=opacity;
    }
    private targets():object[]{const values:object[]=[this.node];if(this._body)values.push(this._body);if(this._head)values.push(this._head);if(this._opacity)values.push(this._opacity);return values;}
    private stop():void{for(const target of this.targets())Tween.stopAllByTarget(target);}
}

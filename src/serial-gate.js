export class SerialGate {
 constructor(){this.tail=Promise.resolve();}
 run(fn){const task=this.tail.then(fn);this.tail=task.catch(()=>{});return task;}
}

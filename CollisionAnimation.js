export class CollisionAnimation{
    constructor(game, x, y){
        this.game = game;
        this.image = document.getElementById('collision');
        this.spriteWidth = 100;
        this.spriteHeight = 90;
        this.sizeModifier = Math.random() +0.5;
        this.width = this.spriteWidth * this.sizeModifier;
        this.heigth = this.spriteHeight * this.sizeModifier;
        this.x = x -this.width * 0.5;
        this.y = y -this.height * 0.5;
        this.frameX = 0;
        this.maxFrame = 4;
        this.markedForDeletion = false;
    }
    update(){
        this.x -= this.game.speed;
    }
    draw(context){
        context.drawImage(this.image, this.frameX * this.spriteWidth, 0, this.spriteWidth, this.spriteHeight, this.x, this.y, this.width, this.height);
    }

}
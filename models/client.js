var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var userSchema = new Schema({
    email:{type:String, required:true},
    password:{type: String, required: true},
    name: {type: String, required: true},
    number: {type: String, required: true},
    data:{type:Object}
});


module.exports=mongoose.model('Client',userSchema);

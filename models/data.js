var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var userSchema = new Schema({
    name:{type:String, required:true},
    bnbdata:{type:Object, required: true},
    oexdata:{type:Object, required: true},
});


module.exports=mongoose.model('Data',userSchema);

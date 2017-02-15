// ==UserScript==
// @name         Inventory Everything
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Inventory all items in your house.
// @author       BrokenSoul (with help from spfiredrake)
// @match        *https://www.playinitium.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

const ver = "inventorydata001";
//GM_setValue(ver, JSON.stringify({}));  // I used this to clear inventory data

// Notes:  This will inventory everything on the ground wherever you are
// To inventory a store, click on the store.  It takes a long time
// Keep track of your progress in the Developer Java Console (in chrome at least)

(function() {
    'use strict';
    $(document).ready(function() {

        setTimeout(function() {
            $('.main-description').first().append("<br/><a id='doInventory' style='font-size: small;' href='#'>run inventory</a>");
            $('.main-description').first().append("<br/><a id='inventoryexport' style='font-size: small;' href='#'>export inventory</a>");

            $("#inventoryexport").on("click", function(e) {
                e.preventDefault();
                exportInventoryData();
            });

            $("#doInventory").on("click", function(e) {
                e.preventDefault();
                getLocalStuff();
            });

            getShopItems();


        }, 2000);
    });

})();

function exportInventoryData() {
    var myjson = JSON.stringify(JSON.parse(GM_getValue(ver, JSON.stringify({}))), null, 2);
    //console.log(myjson);
    var x = window.open();
    x.document.open();
    x.document.write('<html><body><pre>' + myjson + '</pre></body></html>');
    x.document.close();
}

function getLocalStuff() {
    console.log("Running inventory on local items.  Give it a little time to complete before exporting. (10 seconds or so)");
    var localItemsList,localItemsURL="/ajax_moveitems.jsp?preset=location";
    var data1 = JSON.parse(GM_getValue(ver, JSON.stringify({})));
    window.localItems={};//clear the obj
    $.ajax({ url: localItemsURL, type: "GET",
            success: function(data) {
                var itemLines="",itemSubLines="",localItemSummary="",
                    localItemsList=$(data).find("#right a.clue"),
                    items=localItemsList.map(function(index) {
                        var itemClass=$(localItemsList[index]).attr("class"),
                            rarity=itemClass.replace("clue","").replace("item-","").replace(" ",""),
                            viewLink=$(localItemsList[index]).attr("rel"),
                            item={id:viewLink.split("=")[1],
                                  name:$(localItemsList[index]).text(),
                                  updateLocalCount:function(count) { $(".cell[item-name='"+this.name.encode()+"']:eq(0)").parent().find(".cell:eq(1) span").text(count);},
                                  class:itemClass,
                                  viewLink:viewLink,
                                  rarity:(rarity==="")?rarity="common":rarity=rarity,
                                  stats:{},
                                  statLine:"",
                                  delete:function() { return delete window.localItems[this.name][this.id]; },
                                 };
                        if(!window.localItems[item.name]) window.localItems[item.name]={}; //create item
                        window.localItems[item.name][item.id]=item;
                        return item;

                    });

                var total = 0;
                var current = 0;
                for(var item in window.localItems) {
                    for (var itemid in window.localItems[item]) {
                        var parser = new ItemStatParser(); parser.FetchItem(itemid, function(itemObj) {
                            if(data1[itemObj.Name]){
                                data1[itemObj.Name].push(itemObj);
                            }else{
                                data1[itemObj.Name] = [itemObj];
                            }
                            GM_setValue(ver, JSON.stringify(data1));
                            current = current + 1;
                            console.log("getting " + current + " of " + total);
                        });
                        total = total + 1;
                    }
                }
                console.log("Total: " + total);
            }
     });
}

(function($) {
    var ajaxQueue = $({}); // jQuery on an empty object, we are going to use this as our Queue
    $.ajaxQueue = function( ajaxOpts ) {
        var jqXHR,dfd = $.Deferred(),promise = dfd.promise();
        ajaxQueue.queue( doRequest ); // queue our ajax request
        promise.abort = function( statusText ) { // add the abort method
            if ( jqXHR ) return jqXHR.abort( statusText ); // proxy abort to the jqXHR if it is active
            var queue = ajaxQueue.queue(),index = $.inArray( doRequest, queue ); // if there wasn't already a jqXHR we need to remove from queue
            if ( index > -1 ) queue.splice( index, 1 );
            dfd.rejectWith( ajaxOpts.context || ajaxOpts, [ promise, statusText, "" ] );// and then reject the deferred
            return promise;
        };
        function doRequest( next ) { jqXHR = $.ajax( ajaxOpts ); setTimeout(function() { jqXHR.done( dfd.resolve ).fail( dfd.reject ).then( next, next );}, ajaxOpts.delay || 0); } // run the actual query
        return promise;
    };
})($);

var ItemStatParser = function() {
  var that = this;
  // The transformations we'll be using from the item info.
  var StatMap = [["dexterityPenalty","DexPen"],["strengthRequirement","Str"],["weaponDamage","Dmg"],
    ["weaponDamageSummary","DmgMax","val = val.match(/(\\d+\\.?\\d*) max dmg/)[1];"],
    ["weaponDamageSummary","DmgAvg","val = val.match(/(\\d+\\.?\\d*) avg dmg/)[1];"],
    ["weaponDamageCriticalChance","Crit", "val = val.split(' ')[0];"],
    ["weaponDamageCriticalMultiplier","Mult"],
    ["weaponDamageType","DmgType","val = val.replace('Bludgeoning','B').replace('Slashing','S').replace('Piercing','P').replace(' and ',',');"],
    ["blockChance","Blk"],["damageReduction","DR"],["blockBludgeoningCapability","BDR","val = translateBlock(itemObj, val);"],
    ["blockPiercingCapability","PDR","val = translateBlock(itemObj, val);"],["blockSlashingCapability","SDR","val = translateBlock(itemObj, val);"],
    ["weight", "Wt"],["space","Spc"],["durability","Dura"],["maxWeight","StoreWt"],["maxSpace","StoreSpc"],["warmth","Warm"]];
  // Our DR transformation. Will be used to calculate the different DR types and values.
  var BlockValues = {N:0.0,M:0.5,P:0.75,A:1.0,G:1.5,E:2.0};

  // Translates a particular block type to a numeric value.
  var translateBlock = function(item, block)
  {
    if(!block) return null;

    var newBlock = block.charAt(0);

    if(item && item.DR && !isNaN(+item.DR))
    {
      var newDr = +item.DR * (BlockValues[newBlock] || 1.0);
      return newBlock + " (" + (newDr | 0) + ")";
    }
    return newBlock;
  };

  this.FetchItem = function(itemId, callback)
  {
    var req = $.ajaxQueue({url:"/viewitemmini.jsp?itemId="+itemId,method:"GET",delay:100}).then(that.ParseItem);
    if(callback) req.done(callback);
  };

  this.ParseItem = function(data)
  {
    var itemObj = {};
    var itemData = $(data);

    itemObj.ItemID = itemData.find("#popupItemId").val();
    var tempNode = itemData.find("span[name='itemName']");
    itemObj.Name = tempNode.text();
    itemObj.ClassName = tempNode.next("div").text();
    // hasClass("") is equivalent to checking if no class exists or an empty class specified.
    itemObj.Rarity = tempNode.hasClass("") ? "common" : tempNode.attr("class").replace("item-","");

    var val, curStat, findStat;
    for(var statidx = 0; statidx < StatMap.length; statidx++)
    {
      curStat = StatMap[statidx];
      findStat = "[name='"+curStat[0]+"']";
      val = itemData.find(".item-popup-field"+findStat+" .main-item-subnote,.item-popup-field-summary"+findStat).text().trim();
      if(val)
      {
        if(curStat.length === 3) eval(curStat[2]);
        itemObj[curStat[1]] = val;
      }
    }

    if(typeof that.LoggedItems[itemObj.ClassName || itemObj.Name] === "undefined") that.LoggedItems[itemObj.ClassName || itemObj.Name] = {};
    that.LoggedItems[itemObj.ClassName || itemObj.Name][itemObj.ItemID] = itemObj;
    return itemObj;
  };
  this.LoggedItems = {};
};

function getShopItems() {
    console.log("Testing");
    window.FLAG_LOADSHOPITEMS=true;
    var data1 = JSON.parse(GM_getValue(ver, JSON.stringify({})));
    var itemsLoaded = setInterval(function() {
        var numSold=$(".saleItem-sold").length;
        var total = numSold;
        var current = 0;
        if (numSold) {
            var shopItems=$(".saleItem");
            for(var i=0;i<shopItems.length;i++) {
                var itemId=$(shopItems[i]).find(".clue").attr("rel").split("=")[1];
                //$(shopItems[i]).append("<div class='shop-item-stats table' id='shop-item-container"+itemId+"'><div class='loading'>Loading item stats... <img src='/javascript/images/wait.gif'></div></div>");
                //console.log(itemId);

                var parser = new ItemStatParser(); parser.FetchItem(itemId, function(itemObj) {
                    //data1.push({[itemObj.Name]: itemObj});
                    if(data1[itemObj.Name]){
                        data1[itemObj.Name].push(itemObj);
                    }else{
                        data1[itemObj.Name] = [itemObj];
                    }
                    GM_setValue(ver, JSON.stringify(data1));
                    current = current + 1;
                    console.log("getting " + current + " of " + total);
                });
                total = total + 1;
            }
            window.FLAG_LOADSHOPITEMS=false;
            clearInterval(itemsLoaded);
        }
    }, 1000);
}

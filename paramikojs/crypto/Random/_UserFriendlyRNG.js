crypto.random.Random = function () {
  this._fa = new crypto.random.Fortuna.FortunaAccumulator();
  this._ec = new crypto.random._EntropyCollector(this._fa);
  this.reinit();
}

crypto.random.Random.prototype = {
  reinit : function() {
    /*
      Initialize the random number generator and seed it with entropy from
      the operating system.
    */
    this._ec.reinit();
  },

  flush : function(s) {
    // pass
  },

  // Return N bytes from the RNG.
  read : function(N, dontFlush) {
    // Collect some entropy and feed it to Fortuna
    this._ec.collect(dontFlush);

    // Ask Fortuna to generate some bytes
    var retval = this._fa.random_data(N);

    // Return the random data.
    return retval;
  }
};


crypto.random._EntropySource = function(accumulator, src_num) {
  this._fortuna = accumulator;
  this._src_num = src_num;
  this._pool_num = 0;
}

crypto.random._EntropySource.prototype = {
  feed : function(data) {
    this._fortuna.add_random_event(this._src_num, this._pool_num, data);
    this._pool_num = (this._pool_num + 1) & 31;
  }
};

// TODO (maybe): you can use Mozilla's internal random API alternatively
// var prng = Components.classes['@mozilla.org/security/random-generator;1'];
// var bytebucket = prng.getService(Components.interfaces.nsIRandomGenerator).generateRandomBytes(numberOfBytes, buffer);

crypto.random._EntropyCollector = function(accumulator) {
  if (sys.browser == 'mozilla') {
    this._osrng = sys.platform == 'win32' ? new crypto.random.OSRNG.WindowsRNG() : new crypto.random.OSRNG.DevURandomRNG();
  } else {
    this._osrng = new crypto.random.OSRNG.BrowserRNG();
  }
  this._osrng_es = new crypto.random._EntropySource(accumulator, 255);
  this._time_es = new crypto.random._EntropySource(accumulator, 254);
  this._time2_es = new crypto.random._EntropySource(accumulator, 253);

  this.previousMilliseconds = new Date().getMilliseconds();
}

crypto.random._EntropyCollector.prototype = {
  reinit : function() {
    // Add 256 bits to each of the 32 pools, twice.  (For a total of 16384
    // bits collected from the operating system.)
    for (var i = 0; i < 2; ++i) {
      var block = this._osrng.read(32*32);
      for (var p = 0; p < 32; ++p) {
        this._osrng_es.feed(block.substring(p*32,(p+1)*32));
      }
      block = null;
    }
    this._osrng.flush();
  },

  collect : function(dontFlush) {
    // Collect 64 bits of entropy from the operating system and feed it to Fortuna.
    this._osrng_es.feed(this._osrng.read(8, dontFlush));

    // Add the fractional part of date
    var t = new Date().getMilliseconds() * Math.random() / 1000;
    this._time_es.feed(struct.pack("@I", parseInt(Math.pow(2, 30) * (t - Math.floor(t)))));

    // Add another fractional part of date
    var newMilliseconds = new Date().getMilliseconds();
    t = ((this.previousMilliseconds + newMilliseconds) % 1000) * Math.random() / 1000;
    this.previousMilliseconds = newMilliseconds;
    this._time2_es.feed(struct.pack("@I", parseInt(Math.pow(2, 30) * (t - Math.floor(t)))));
  }
};

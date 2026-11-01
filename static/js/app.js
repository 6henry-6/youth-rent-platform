const { createApp } = Vue;

createApp({
  delimiters: ['[[', ']]'],
  data() {
    return {
      meta: { districts: [], destinations: [] },
      filters: { district: '全部', destination: '人民广场', budget: 4500, maxCommute: 60 },
      summary: {}, listings: [], timer: null, charts: {},
      nationalMeta: { cities: [], districts: [] },
      nationalFilters: { city: '北京', district: '全部', budget: 15000 },
      nationalSummary: {}, nationalListings: [], nationalTimer: null
    };
  },
  async mounted() {
    this.meta = await (await fetch('/api/meta')).json();
    await this.loadNationalMeta();
    await Promise.all([this.refresh(), this.refreshNational()]);
    window.addEventListener('resize', () => Object.values(this.charts).forEach(c => c.resize()));
  },
  methods: {
    debouncedRefresh() { clearTimeout(this.timer); this.timer = setTimeout(this.refresh, 160); },
    debouncedNational() { clearTimeout(this.nationalTimer); this.nationalTimer = setTimeout(this.refreshNational, 160); },
    reset() { this.filters = { district:'全部', destination:'人民广场', budget:4500, maxCommute:60 }; this.refresh(); },
    async loadNationalMeta() {
      this.nationalMeta = await (await fetch('/api/national/meta?city=' + encodeURIComponent(this.nationalFilters.city))).json();
    },
    async changeCity() {
      this.nationalFilters.district = '全部';
      await this.loadNationalMeta();
      await this.refreshNational();
    },
    resetNational() {
      this.nationalFilters = { city:'北京', district:'全部', budget:15000 };
      this.changeCity();
    },
    async refreshNational() {
      const q = new URLSearchParams({ city:this.nationalFilters.city, district:this.nationalFilters.district, budget:this.nationalFilters.budget });
      const data = await (await fetch('/api/national/dashboard?' + q)).json();
      this.nationalSummary = data.summary; this.nationalListings = data.listings || [];
      this.$nextTick(() => this.drawNational(data));
    },
    async refresh() {
      const q = new URLSearchParams({ district:this.filters.district, destination:this.filters.destination, budget:this.filters.budget, max_commute:this.filters.maxCommute });
      const data = await (await fetch('/api/dashboard?' + q)).json();
      this.summary = data.summary; this.listings = data.listings || [];
      this.$nextTick(() => this.drawShanghai(data));
    },
    chart(id) {
      if (!this.charts[id]) this.charts[id] = echarts.init(document.getElementById(id));
      return this.charts[id];
    },
    drawNational(data) {
      const teal='#007c78', orange='#ef8e3b', blue='#356d92', muted='#71808a', grid='#e8ece9';
      this.chart('cityChart').setOption({
        tooltip:{trigger:'axis',axisPointer:{type:'shadow'}},legend:{top:0},grid:{left:58,right:22,top:42,bottom:45},
        xAxis:{type:'category',data:data.city_stats.map(x=>x.city),axisLabel:{color:muted}},
        yAxis:[{type:'value',name:'月租中位数',splitLine:{lineStyle:{color:grid}}},{type:'value',name:'元/㎡'}],
        series:[{name:'月租中位数',type:'bar',data:data.city_stats.map(x=>x.median_rent),itemStyle:{color:teal}},{name:'单位面积租金',type:'line',yAxisIndex:1,data:data.city_stats.map(x=>x.median_unit_rent),lineStyle:{color:orange},itemStyle:{color:orange}}]
      }, true);
      const ranked=[...data.city_stats].sort((a,b)=>b.affordability-a.affordability);
      this.chart('rankChart').setOption({tooltip:{trigger:'axis'},grid:{left:58,right:25,top:25,bottom:45},xAxis:{type:'category',data:ranked.map(x=>x.city)},yAxis:{type:'value',name:'相对指数',min:30,max:100,splitLine:{lineStyle:{color:grid}}},series:[{type:'bar',data:ranked.map(x=>x.affordability),itemStyle:{color:blue}}]},true);
      const district=this.chart('nationalDistrictChart');
      district.setOption({tooltip:{trigger:'axis'},grid:{left:55,right:20,top:25,bottom:70},xAxis:{type:'category',data:data.districts.map(x=>x.district),axisLabel:{rotate:32,color:muted}},yAxis:{type:'value',name:'预算内样本数',splitLine:{lineStyle:{color:grid}}},series:[{type:'bar',data:data.districts.map(x=>x.count),itemStyle:{color:teal}}]},true);
      district.off('click'); district.on('click',p=>{this.nationalFilters.district=p.name;this.refreshNational();});
      this.chart('roomChart').setOption({tooltip:{trigger:'axis'},grid:{left:55,right:20,top:25,bottom:70},xAxis:{type:'category',data:data.rooms.map(x=>x.room_type),axisLabel:{rotate:30,color:muted}},yAxis:{type:'value',name:'月租中位数',splitLine:{lineStyle:{color:grid}}},series:[{type:'bar',data:data.rooms.map(x=>x.median_rent),itemStyle:{color:orange}}]},true);
      this.chart('nationalScatterChart').setOption({tooltip:{formatter:p=>`${p.data[3]}<br>${p.data[4]}<br>面积 ${p.data[0]}㎡<br>月租 ¥${p.data[1]}<br>${p.data[2]} 元/㎡`},grid:{left:62,right:30,top:25,bottom:48},xAxis:{name:'面积（㎡）',splitLine:{lineStyle:{color:grid}}},yAxis:{name:'月租（元）',splitLine:{lineStyle:{color:grid}}},visualMap:{show:false,min:60,max:280,dimension:2,inRange:{color:[teal,orange]}},series:[{type:'scatter',symbolSize:8,data:data.scatter.map(x=>[x.area,x.rent,x.rent_per_sqm,x.project,x.district])}]},true);
    },
    drawShanghai(data) {
      const ink='#102431',teal='#007c78',orange='#ef8e3b',muted='#71808a',grid='#e8ece9';
      const district=this.chart('districtChart');
      district.setOption({animationDuration:500,tooltip:{trigger:'axis'},grid:{left:48,right:20,top:28,bottom:55},xAxis:{type:'category',data:(data.districts||[]).map(x=>x.district),axisLabel:{rotate:25,color:muted}},yAxis:{type:'value',name:'项目数',splitLine:{lineStyle:{color:grid}}},series:[{type:'bar',data:(data.districts||[]).map(x=>x.count),itemStyle:{color:teal},emphasis:{itemStyle:{color:orange}}}]},true);
      district.off('click');district.on('click',p=>{this.filters.district=p.name;this.refresh();});
      this.chart('scatterChart').setOption({tooltip:{formatter:p=>`${p.data[3]}<br>面积 ${p.data[0]}㎡<br>月租 ¥${p.data[1]}<br>通勤 ${p.data[2]} 分钟`},grid:{left:58,right:28,top:28,bottom:48},xAxis:{name:'面积（㎡）',splitLine:{lineStyle:{color:grid}}},yAxis:{name:'月租（元）',splitLine:{lineStyle:{color:grid}}},visualMap:{show:false,min:20,max:120,dimension:2,inRange:{color:[teal,orange]}},series:[{type:'scatter',symbolSize:v=>Math.max(8,Math.min(30,v[2]/2.8)),data:(data.scatter||[]).map(x=>[x.area_mid,x.rent_mid,x.commute,x.project])}]},true);
      this.chart('parallelChart').setOption({parallelAxis:[{dim:0,name:'月租',min:0,max:9000},{dim:1,name:'面积',min:10,max:100},{dim:2,name:'通勤',min:15,max:120},{dim:3,name:'可负担指数',min:0,max:100}],parallel:{left:70,right:70,top:38,bottom:35,parallelAxisDefault:{nameTextStyle:{color:ink},axisLine:{lineStyle:{color:grid}},splitLine:{lineStyle:{color:grid}},axisLabel:{color:muted}}},series:[{type:'parallel',lineStyle:{width:1.4,opacity:.28,color:teal},data:(data.parallel||[]).map(x=>[x.rent_mid,x.area_mid,x.commute,x.affordability_score])}]},true);
    }
  }
}).mount('#app');

// ==UserScript==
// @name         BISTU教务系统课表导出
// @namespace    https://github.com/CN-MRZZJ/tampermonkey-scripts
// @version      1.1.0
// @description  在BISTU（北京信息科技大学）教务系统课表页面添加CSV和iCal导出选项，支持导入WakeUp课程表和日历应用
// @author       MRZZJ
// @match        https://jwxt.bistu.edu.cn/jwapp/sys/kbapp/*default/index.do*
// @grant        none
// @run-at       document-end
// @unwrap
// @license      MIT
// @homepageURL  https://github.com/CN-MRZZJ/tampermonkey-scripts
// @supportURL   https://github.com/CN-MRZZJ/tampermonkey-scripts/issues
// @updateURL    https://raw.githubusercontent.com/CN-MRZZJ/tampermonkey-scripts/main/bistu-jwxt-export-schedule.user.js
// @downloadURL  https://raw.githubusercontent.com/CN-MRZZJ/tampermonkey-scripts/main/bistu-jwxt-export-schedule.user.js
// @icon         https://info.bistu.edu.cn//home/icon.jpg
// ==/UserScript==


(function() {
    'use strict';

    // 在现有下拉菜单中添加导出选项
    function addExportOption() {
        // 查找下拉菜单
        const dropdownMenu = document.querySelector('ul.el-dropdown-menu');
        if (!dropdownMenu) {
            // 如果没找到，等待一段时间后重试
            setTimeout(addExportOption, 1000);
            return;
        }

        // 检查是否已存在导出选项
        if (document.getElementById('export-csv-option') || document.getElementById('export-ical-option')) {
            return;
        }

        // 创建CSV导出选项
        const exportOption = document.createElement('li');
        exportOption.id = 'export-csv-option';
        exportOption.tabIndex = -1;
        exportOption.className = 'el-dropdown-menu__item';
        exportOption.innerHTML = '<!---->\n                             CSV\n                         ';
        exportOption.style.cssText = 'cursor: pointer;';

        // 添加点击事件
        exportOption.addEventListener('click', exportSchedule);

        // 创建iCal导出选项
        const exportIcalOption = document.createElement('li');
        exportIcalOption.id = 'export-ical-option';
        exportIcalOption.tabIndex = -1;
        exportIcalOption.className = 'el-dropdown-menu__item';
        exportIcalOption.innerHTML = '<!---->\n                             iCal\n                         ';
        exportIcalOption.style.cssText = 'cursor: pointer;';

        // 添加点击事件
        exportIcalOption.addEventListener('click', exportScheduleIcal);

        // 在Word选项前插入
        const wordOption = dropdownMenu.querySelector('li.el-dropdown-menu__item');
        if (wordOption) {
            dropdownMenu.insertBefore(exportOption, wordOption);
            dropdownMenu.insertBefore(exportIcalOption, wordOption);
        } else {
            dropdownMenu.appendChild(exportOption);
            dropdownMenu.appendChild(exportIcalOption);
        }

        console.log('已添加导出CSV和iCal选项到下拉菜单');
        console.log('下拉菜单项数量:', dropdownMenu.children.length);
    }

    // 导出课表函数
    async function exportSchedule() {
        console.log("开始导出课表...");

        async function fetchJSON(url, options = {}) {
            let resp = await fetch(url, options);
            if (!resp.ok) throw new Error(`HTTP 请求失败: ${url}`);
            return await resp.json();
        }

        try {
            // 1. 获取当前用户信息
            console.log("获取当前用户信息...");
            let userUrl = "/jwapp/sys/homeapp/api/home/currentUser.do";
            let userData = await fetchJSON(userUrl);
            
            let termCode = userData.datas?.welcomeInfo?.xnxqdm;
            console.log("自动检测到的学期代码:", termCode);
            
            let studentId = userData.datas?.userId ||   
                            userData.datas?.user?.xh ||   
                            userData.datas?.user?.usrId ||
                            userData.datas?.student?.xh ||
                            userData.datas?.welcomeInfo?.xh ||
                            "";
            console.log("学号:", studentId);

            // 生成学期代码选择器
            function showTermSelector(defaultTerm) {
                // 解析默认学期代码
                let defaultYearStart = 2025;
                let parsedTerm = 1;
                if (defaultTerm) {
                    const parts = defaultTerm.split('-');
                    if (parts.length === 3) {
                        defaultYearStart = parseInt(parts[0]);
                        parsedTerm = parseInt(parts[2]);
                    }
                }

                // 创建弹窗容器
                const container = document.createElement('div');
                container.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(0, 0, 0, 0.5);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 9999;
                `;

                // 创建弹窗内容
                const dialog = document.createElement('div');
                dialog.style.cssText = `
                    background-color: white;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
                    width: 400px;
                    max-width: 90%;
                `;

                // 创建标题
                const title = document.createElement('h3');
                title.textContent = '选择学期';
                title.style.marginTop = '0';
                dialog.appendChild(title);

                // 创建说明文字
                const info = document.createElement('p');
                info.textContent = '请选择您要导出的学年和学期：';
                info.style.fontSize = '14px';
                info.style.color = '#666';
                info.style.marginBottom = '20px';
                dialog.appendChild(info);

                // 创建表单容器
                const form = document.createElement('div');
                form.style.display = 'flex';
                form.style.flexDirection = 'column';
                form.style.gap = '15px';
                dialog.appendChild(form);

                // 学年选择
                const yearGroup = document.createElement('div');
                form.appendChild(yearGroup);

                const yearLabel = document.createElement('label');
                yearLabel.textContent = '学年：';
                yearLabel.style.display = 'block';
                yearLabel.style.marginBottom = '5px';
                yearLabel.style.fontSize = '14px';
                yearGroup.appendChild(yearLabel);

                const yearSelect = document.createElement('select');
                yearSelect.style.cssText = `
                    width: 100%;
                    padding: 8px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 14px;
                `;

                // 生成最近几年的选项
                const currentYear = new Date().getFullYear();
                for (let year = currentYear; year >= currentYear - 3; year--) {
                    const option = document.createElement('option');
                    option.value = year;
                    option.textContent = `${year}-${year + 1}学年`;
                    if (year === defaultYearStart) {
                        option.selected = true;
                    }
                    yearSelect.appendChild(option);
                }
                yearGroup.appendChild(yearSelect);

                // 学期选择
                const termGroup = document.createElement('div');
                form.appendChild(termGroup);

                const termLabel = document.createElement('label');
                termLabel.textContent = '学期：';
                termLabel.style.display = 'block';
                termLabel.style.marginBottom = '5px';
                termLabel.style.fontSize = '14px';
                termGroup.appendChild(termLabel);

                const termSelect = document.createElement('select');
                termSelect.style.cssText = `
                    width: 100%;
                    padding: 8px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 14px;
                `;

                // 学期选项
                const termOptions = [
                    { value: 1, text: '上学期' },
                    { value: 2, text: '下学期' },
                    { value: 3, text: '小学期' }
                ];

                termOptions.forEach(option => {
                    const opt = document.createElement('option');
                    opt.value = option.value;
                    opt.textContent = option.text;
                    if (option.value === parsedTerm) {
                        opt.selected = true;
                    }
                    termSelect.appendChild(opt);
                });
                termGroup.appendChild(termSelect);

                // 创建按钮容器
                const buttons = document.createElement('div');
                buttons.style.textAlign = 'right';
                buttons.style.marginTop = '20px';
                dialog.appendChild(buttons);

                // 创建确认按钮
                const confirmBtn = document.createElement('button');
                confirmBtn.textContent = '确认';
                confirmBtn.style.cssText = `
                    padding: 8px 16px;
                    background-color: #4CAF50;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    margin-right: 10px;
                `;
                buttons.appendChild(confirmBtn);

                // 创建取消按钮
                const cancelBtn = document.createElement('button');
                cancelBtn.textContent = '取消';
                cancelBtn.style.cssText = `
                    padding: 8px 16px;
                    background-color: #f44336;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                `;
                buttons.appendChild(cancelBtn);

                // 添加到页面
                container.appendChild(dialog);
                document.body.appendChild(container);

                // 返回Promise，等待用户选择
                return new Promise((resolve, reject) => {
                    confirmBtn.addEventListener('click', function() {
                        const selectedYear = parseInt(yearSelect.value);
                        const selectedTerm = parseInt(termSelect.value);
                        const termCode = `${selectedYear}-${selectedYear + 1}-${selectedTerm}`;
                        document.body.removeChild(container);
                        resolve(termCode);
                    });

                    cancelBtn.addEventListener('click', function() {
                        document.body.removeChild(container);
                        reject(new Error('用户取消选择'));
                    });

                    // 点击外部关闭
                    container.addEventListener('click', function(e) {
                        if (e.target === container) {
                            document.body.removeChild(container);
                            reject(new Error('用户取消选择'));
                        }
                    });
                });
            }

            // 显示学期选择器
            try {
                termCode = await showTermSelector(termCode);
                console.log("用户选择的学期代码:", termCode);
            } catch (err) {
                console.log("用户取消选择:", err);
                return;
            }

            // 2. 获取学期周次信息
            console.log("正在拉取学期周次信息...");
            let termWeeksUrl = "/jwapp/sys/kbbpapp/api/schoolCalendar/getTermWeeks.do";
            let termWeeksFormData = new URLSearchParams();
            termWeeksFormData.append('XNXQDM', termCode);

            let termWeeksData = await fetchJSON(termWeeksUrl, {
                method: 'POST',
                body: termWeeksFormData,
                headers: { 
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            console.log("学期周次信息:", termWeeksData);

            // 3. 获取课表数据
            console.log("正在拉取课表数据...");
            let scheduleUrl = "/jwapp/sys/homeapp/api/home/student/getMyScheduleDetail.do";
            let formData = new URLSearchParams();
            formData.append('termCode', termCode);
            if (studentId) {
                formData.append('studentCode', studentId);
                formData.append('xh', studentId);
            }
            formData.append('type', 'term');

            let scheduleData = await fetchJSON(scheduleUrl, {
                method: 'POST',
                body: formData,
                headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }
            });

            console.log("课表接口返回:", scheduleData);

            let arrangedList = scheduleData.datas?.arrangedList || 
                               scheduleData.datas?.list ||
                               scheduleData.data?.rows ||
                               [];

            if (!arrangedList.length) {
                console.warn("未获取到课程数据，请检查学期代码和学号是否正确。");
                alert(`未获取到课程数据。\n学期代码: ${termCode}\n学号: ${studentId || '未获取到'}\n请确认课表页面是否能正常显示。`);
                return;
            }

            console.log(`共获取到 ${arrangedList.length} 门课程。`);

            // 调试：打印第一个课程项
            if (arrangedList.length > 0) {
                console.log("第一个课程项的全部字段:");
                console.log(JSON.stringify(arrangedList[0], null, 2));
            }

            // ========== 解析数据生成 CSV ==========
            let csvRows = [];
            csvRows.push(["课程名称", "星期", "开始节数", "结束节数", "老师", "地点", "周数"]);

            arrangedList.forEach(item => {
                let courseName = item.courseName || "未知课程";
                let dayOfWeek = item.dayOfWeek || "";
                let beginSection = item.beginSection || "";
                let endSection = item.endSection || "";
                
                // 从 weeksAndTeachers 解析周数和教师
                let weeks = "";
                let teacher = "";
                if (item.weeksAndTeachers) {
                    let parts = item.weeksAndTeachers.split('/');
                    if (parts.length > 0) {
                        // 处理周数：去除方括号、圆括号（单/双）、中文“周”，并将英文逗号替换为中文顿号
                        weeks = parts[0]
                            .replace(/\[.*?\]/g, '')      // 去除 [讲授] 等
                            .replace(/\(单\)/g, '单')      // (单) → 单
                            .replace(/\(双\)/g, '双')      // (双) → 双
                            .replace(/周/g, '')            // 去除中文“周”
                            .replace(/,/g, '、')           // 英文逗号 → 中文顿号（间断周分隔）
                            .trim();
                    }
                    if (parts.length > 1) {
                        teacher = parts[1].replace(/\[.*?\]/g, '').trim();
                    }
                }
                
                // 地点优先使用 placeName
                let location = item.placeName || "";
                // 如果 placeName 为空，尝试从 titleDetail 提取
                if (!location && item.titleDetail && item.titleDetail.length > 1) {
                    let lastDetail = item.titleDetail[item.titleDetail.length - 1];
                    let tempDiv = document.createElement('div');
                    tempDiv.innerHTML = lastDetail;
                    let text = tempDiv.textContent || tempDiv.innerText || "";
                    // 取最后一个单词作为地点（可能包含多个单词，如 "WLA-405" 是一个整体）
                    let words = text.trim().split(/\s+/);
                    location = words.pop() || "";
                }

                csvRows.push([courseName, dayOfWeek, beginSection, endSection, teacher, location, weeks]);
            });

            // 解析学期代码为友好格式
            function parseTermCode(termCode) {
                const parts = termCode.split('-');
                if (parts.length === 3) {
                    const year = `${parts[0]}-${parts[1]}`;
                    const term = parts[2];
                    let termName;
                    switch (term) {
                        case '1':
                            termName = '上学期';
                            break;
                        case '2':
                            termName = '下学期';
                            break;
                        case '3':
                            termName = '小学期';
                            break;
                        default:
                            termName = `第${term}学期`;
                    }
                    return `${year}学年 ${termName}`;
                }
                return termCode;
            }

            // 生成当前日期时间字符串
            function getCurrentDateTime() {
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                const hours = String(now.getHours()).padStart(2, '0');
                const minutes = String(now.getMinutes()).padStart(2, '0');
                const seconds = String(now.getSeconds()).padStart(2, '0');
                return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
            }

            // 3. 下载 CSV
            let csvContent = "\uFEFF" + csvRows.map(e => e.map(f => `"${String(f).replace(/"/g, '""')}"`).join(",")).join("\n");

            let blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            let link = document.createElement("a");
            if (link.download !== undefined) {
                let url = URL.createObjectURL(blob);
                link.setAttribute("href", url);
                link.setAttribute("download", `课程表导出_${getCurrentDateTime()}.csv`);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }

            console.log("导出完成！请检查 CSV 文件。");

        } catch (err) {
            console.error("导出失败:", err);
            alert("导出出错，请查看控制台日志。\n" + err.message);
        }
    }

    // 导出课表为iCal函数
    async function exportScheduleIcal() {
        console.log("开始导出iCal日历...");

        async function fetchJSON(url, options = {}) {
            let resp = await fetch(url, options);
            if (!resp.ok) throw new Error(`HTTP 请求失败: ${url}`);
            return await resp.json();
        }

        try {
            // 1. 获取当前用户信息
            console.log("获取当前用户信息...");
            let userUrl = "/jwapp/sys/homeapp/api/home/currentUser.do";
            let userData = await fetchJSON(userUrl);
            
            let termCode = userData.datas?.welcomeInfo?.xnxqdm;
            console.log("自动检测到的学期代码:", termCode);
            
            let studentId = userData.datas?.userId ||   
                            userData.datas?.user?.xh ||   
                            userData.datas?.user?.usrId ||
                            userData.datas?.student?.xh ||
                            userData.datas?.welcomeInfo?.xh ||
                            "";
            console.log("学号:", studentId);

            // 生成学期代码选择器（复用CSV导出的函数）
            function showTermSelector(defaultTerm) {
                // 解析默认学期代码
                let defaultYearStart = 2025;
                let parsedTerm = 1;
                if (defaultTerm) {
                    const parts = defaultTerm.split('-');
                    if (parts.length === 3) {
                        defaultYearStart = parseInt(parts[0]);
                        parsedTerm = parseInt(parts[2]);
                    }
                }

                // 创建弹窗容器
                const container = document.createElement('div');
                container.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(0, 0, 0, 0.5);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 9999;
                `;

                // 创建弹窗内容
                const dialog = document.createElement('div');
                dialog.style.cssText = `
                    background-color: white;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
                    width: 400px;
                    max-width: 90%;
                `;

                // 创建标题
                const title = document.createElement('h3');
                title.textContent = '选择学期';
                title.style.marginTop = '0';
                dialog.appendChild(title);

                // 创建说明文字
                const info = document.createElement('p');
                info.textContent = '请选择您要导出的学年和学期：';
                info.style.fontSize = '14px';
                info.style.color = '#666';
                info.style.marginBottom = '20px';
                dialog.appendChild(info);

                // 创建表单容器
                const form = document.createElement('div');
                form.style.display = 'flex';
                form.style.flexDirection = 'column';
                form.style.gap = '15px';
                dialog.appendChild(form);

                // 学年选择
                const yearGroup = document.createElement('div');
                form.appendChild(yearGroup);

                const yearLabel = document.createElement('label');
                yearLabel.textContent = '学年：';
                yearLabel.style.display = 'block';
                yearLabel.style.marginBottom = '5px';
                yearLabel.style.fontSize = '14px';
                yearGroup.appendChild(yearLabel);

                const yearSelect = document.createElement('select');
                yearSelect.style.cssText = `
                    width: 100%;
                    padding: 8px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 14px;
                `;

                // 生成最近几年的选项
                const currentYear = new Date().getFullYear();
                for (let year = currentYear; year >= currentYear - 3; year--) {
                    const option = document.createElement('option');
                    option.value = year;
                    option.textContent = `${year}-${year + 1}学年`;
                    if (year === defaultYearStart) {
                        option.selected = true;
                    }
                    yearSelect.appendChild(option);
                }
                yearGroup.appendChild(yearSelect);

                // 学期选择
                const termGroup = document.createElement('div');
                form.appendChild(termGroup);

                const termLabel = document.createElement('label');
                termLabel.textContent = '学期：';
                termLabel.style.display = 'block';
                termLabel.style.marginBottom = '5px';
                termLabel.style.fontSize = '14px';
                termGroup.appendChild(termLabel);

                const termSelect = document.createElement('select');
                termSelect.style.cssText = `
                    width: 100%;
                    padding: 8px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 14px;
                `;

                // 学期选项
                const termOptions = [
                    { value: 1, text: '上学期' },
                    { value: 2, text: '下学期' },
                    { value: 3, text: '小学期' }
                ];

                termOptions.forEach(option => {
                    const opt = document.createElement('option');
                    opt.value = option.value;
                    opt.textContent = option.text;
                    if (option.value === parsedTerm) {
                        opt.selected = true;
                    }
                    termSelect.appendChild(opt);
                });
                termGroup.appendChild(termSelect);

                // 创建按钮容器
                const buttons = document.createElement('div');
                buttons.style.textAlign = 'right';
                buttons.style.marginTop = '20px';
                dialog.appendChild(buttons);

                // 创建确认按钮
                const confirmBtn = document.createElement('button');
                confirmBtn.textContent = '确认';
                confirmBtn.style.cssText = `
                    padding: 8px 16px;
                    background-color: #4CAF50;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    margin-right: 10px;
                `;
                buttons.appendChild(confirmBtn);

                // 创建取消按钮
                const cancelBtn = document.createElement('button');
                cancelBtn.textContent = '取消';
                cancelBtn.style.cssText = `
                    padding: 8px 16px;
                    background-color: #f44336;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                `;
                buttons.appendChild(cancelBtn);

                // 添加到页面
                container.appendChild(dialog);
                document.body.appendChild(container);

                // 返回Promise，等待用户选择
                return new Promise((resolve, reject) => {
                    confirmBtn.addEventListener('click', function() {
                        const selectedYear = parseInt(yearSelect.value);
                        const selectedTerm = parseInt(termSelect.value);
                        const termCode = `${selectedYear}-${selectedYear + 1}-${selectedTerm}`;
                        document.body.removeChild(container);
                        resolve(termCode);
                    });

                    cancelBtn.addEventListener('click', function() {
                        document.body.removeChild(container);
                        reject(new Error('用户取消选择'));
                    });

                    // 点击外部关闭
                    container.addEventListener('click', function(e) {
                        if (e.target === container) {
                            document.body.removeChild(container);
                            reject(new Error('用户取消选择'));
                        }
                    });
                });
            }

            // 显示学期选择器
            try {
                termCode = await showTermSelector(termCode);
                console.log("用户选择的学期代码:", termCode);
            } catch (err) {
                console.log("用户取消选择:", err);
                return;
            }

            // 2. 获取学期周次信息
            console.log("正在拉取学期周次信息...");
            let termWeeksUrl = "/jwapp/sys/kbbpapp/api/schoolCalendar/getTermWeeks.do";
            let termWeeksFormData = new URLSearchParams();
            termWeeksFormData.append('XNXQDM', termCode);

            let termWeeksData = await fetchJSON(termWeeksUrl, {
                method: 'POST',
                body: termWeeksFormData,
                headers: { 
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            console.log("学期周次信息:", termWeeksData);

            // 3. 获取课表数据
            console.log("正在拉取课表数据...");
            let scheduleUrl = "/jwapp/sys/homeapp/api/home/student/getMyScheduleDetail.do";
            let formData = new URLSearchParams();
            formData.append('termCode', termCode);
            if (studentId) {
                formData.append('studentCode', studentId);
                formData.append('xh', studentId);
            }
            formData.append('type', 'term');

            let scheduleData = await fetchJSON(scheduleUrl, {
                method: 'POST',
                body: formData,
                headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }
            });

            console.log("课表接口返回:", scheduleData);

            let arrangedList = scheduleData.datas?.arrangedList || 
                               scheduleData.datas?.list ||
                               scheduleData.data?.rows ||
                               [];

            if (!arrangedList.length) {
                console.warn("未获取到课程数据，请检查学期代码和学号是否正确。");
                alert(`未获取到课程数据。\n学期代码: ${termCode}\n学号: ${studentId || '未获取到'}\n请确认课表页面是否能正常显示。`);
                return;
            }

            console.log(`共获取到 ${arrangedList.length} 门课程。`);

            // 生成当前日期时间字符串
            function getCurrentDateTime() {
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                const hours = String(now.getHours()).padStart(2, '0');
                const minutes = String(now.getMinutes()).padStart(2, '0');
                const seconds = String(now.getSeconds()).padStart(2, '0');
                return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
            }

            // 解析学期代码为友好格式
            function parseTermCode(termCode) {
                const parts = termCode.split('-');
                if (parts.length === 3) {
                    const year = `${parts[0]}-${parts[1]}`;
                    const term = parts[2];
                    let termName;
                    switch (term) {
                        case '1':
                            termName = '上学期';
                            break;
                        case '2':
                            termName = '下学期';
                            break;
                        case '3':
                            termName = '小学期';
                            break;
                        default:
                            termName = `第${term}学期`;
                    }
                    return `${year}学年 ${termName}`;
                }
                return termCode;
            }

            // 生成iCal内容
            function generateICalContent(courses, termCode) {
                const now = new Date();
                const uid = `bistu-schedule-${now.getTime()}-${Math.random().toString(36).substr(2, 9)}`;
                const calendarName = `北京信息科技大学课表 - ${parseTermCode(termCode)}`;
                
                let icalContent = [
                    'BEGIN:VCALENDAR',
                    'VERSION:2.0',
                    'PRODID:-//BISTU Schedule Exporter//CN',
                    'CALSCALE:GREGORIAN',
                    'METHOD:PUBLISH',
                    `X-WR-CALNAME:${calendarName}`,
                    'X-WR-TIMEZONE:Asia/Shanghai'
                ];

                // 课程时间配置（根据教学运转时间表调整）
                const classTimes = [
                    { start: '08:00', end: '08:45' },  // 第1节
                    { start: '08:50', end: '09:35' },  // 第2节
                    { start: '09:50', end: '10:35' },  // 第3节
                    { start: '10:40', end: '11:25' },  // 第4节
                    { start: '11:30', end: '12:15' },  // 第5节
                    { start: '13:30', end: '14:15' },  // 第6节
                    { start: '14:20', end: '15:05' },  // 第7节
                    { start: '15:20', end: '16:05' },  // 第8节
                    { start: '16:10', end: '16:55' },  // 第9节
                    { start: '18:30', end: '19:15' },  // 第10节
                    { start: '19:20', end: '20:05' },  // 第11节
                    { start: '20:10', end: '20:55' },  // 第12节
                    { start: '21:00', end: '21:45' }   // 第13节
                ];

                // 生成学期开始日期（从API获取）
                function getTermStartDate(termCode, termWeeksData) {
                    // 从学期周次信息中获取
                    if (termWeeksData && termWeeksData.datas && termWeeksData.datas.getTermWeeks) {
                        const weeks = termWeeksData.datas.getTermWeeks;
                        // 查找第一周的开始日期
                        const firstWeek = weeks.find(week => week.serialNumber === 1);
                        if (firstWeek && firstWeek.startDate) {
                            console.log("从API获取学期开始日期:", firstWeek.startDate);
                            return new Date(firstWeek.startDate);
                        }
                    }
                    
                    // 如果API获取失败，返回当前日期
                    console.warn("无法从API获取学期开始日期，使用当前日期作为默认值");
                    return new Date();
                }

                const termStartDate = getTermStartDate(termCode, termWeeksData);
                console.log("学期开始日期:", termStartDate);

                // 处理每门课程
                courses.forEach((course, index) => {
                    const courseName = course.courseName || "未知课程";
                    const dayOfWeek = parseInt(course.dayOfWeek) || 1;
                    const beginSection = parseInt(course.beginSection) || 1;
                    const endSection = parseInt(course.endSection) || 1;
                    const teachingTarget = course.teachingTarget || "";
                    
                    // 从 weeksAndTeachers 解析周数和教师
                    let weeks = "";
                    let teacher = "";
                    if (course.weeksAndTeachers) {
                        let parts = course.weeksAndTeachers.split('/');
                        if (parts.length > 0) {
                            weeks = parts[0]
                                .replace(/\[.*?\]/g, '')      // 去除 [讲授] 等
                                .replace(/\(单\)/g, '单')      // (单) → 单
                                .replace(/\(双\)/g, '双')      // (双) → 双
                                .replace(/周/g, '')            // 去除中文"周"
                                .replace(/,/g, '、')           // 英文逗号 → 中文顿号（间断周分隔）
                                .trim();
                        }
                        if (parts.length > 1) {
                            teacher = parts[1].replace(/\[.*?\]/g, '').trim();
                        }
                    }
                    
                    // 地点优先使用 placeName
                    let location = course.placeName || "";
                    // 如果 placeName 为空，尝试从 titleDetail 提取
                    if (!location && course.titleDetail && course.titleDetail.length > 1) {
                        let lastDetail = course.titleDetail[course.titleDetail.length - 1];
                        let tempDiv = document.createElement('div');
                        tempDiv.innerHTML = lastDetail;
                        let text = tempDiv.textContent || tempDiv.innerText || "";
                        // 取最后一个单词作为地点（可能包含多个单词，如 "WLA-405" 是一个整体）
                        let words = text.trim().split(/\s+/);
                        location = words.pop() || "";
                    }

                    // 生成事件描述
                    const description = [
                        `课程名称: ${courseName}`,
                        `教师: ${teacher || '未知'}`,
                        `地点: ${location || '未知'}`,
                        `周数: ${weeks || '未知'}`,
                        `节数: ${beginSection}-${endSection}节`,
                        `班级: ${teachingTarget || '未知'}`
                    ].filter(Boolean).join('\n');

                    // 获取课程时间（优先使用课程自带的时间）
                    const startTime = course.beginTime || classTimes[beginSection - 1]?.start || '08:00';
                    const endTime = course.endTime || classTimes[endSection - 1]?.end || '08:45';

                    // 解析周数信息，生成多个事件
                    const weekNumbers = getWeekNumbers(course.week, weeks);
                    
                    weekNumbers.forEach((weekNum, weekIndex) => {
                        // 计算课程日期（基于学期开始日期 + 周数偏移）
                        const courseDate = new Date(termStartDate);
                        // 加上 (周数-1)*7 天 + (星期几-1) 天
                        courseDate.setDate(courseDate.getDate() + (weekNum - 1) * 7 + (dayOfWeek - 1));

                        // 生成iCal事件
                        const eventUid = `course-${index}-week${weekNum}-${now.getTime()}@bistu.edu.cn`;
                        const startDateTime = formatICalDateTime(courseDate, startTime);
                        const endDateTime = formatICalDateTime(courseDate, endTime);

                        icalContent.push(...[
                            'BEGIN:VEVENT',
                            `UID:${eventUid}`,
                            `DTSTAMP:${formatICalDateTime(now, '00:00')}`,
                            `DTSTART:${startDateTime}`,
                            `DTEND:${endDateTime}`,
                            `SUMMARY:${courseName}`,
                            `DESCRIPTION:${description}`,
                            `LOCATION:${location || '未知'}`,
                            'END:VEVENT'
                        ]);
                    });
                });

                // 解析周数信息
                function getWeekNumbers(weekBinary, weeksText) {
                    const weekNumbers = [];
                    
                    // 优先从 week 二进制字符串解析
                    if (weekBinary && typeof weekBinary === 'string') {
                        for (let i = 0; i < weekBinary.length; i++) {
                            if (weekBinary[i] === '1') {
                                weekNumbers.push(i + 1);
                            }
                        }
                    }
                    
                    // 如果二进制解析失败，尝试从文本解析
                    if (weekNumbers.length === 0 && weeksText) {
                        // 处理范围格式，如 "14-15"
                        const rangeMatch = weeksText.match(/(\d+)-(\d+)/);
                        if (rangeMatch) {
                            const start = parseInt(rangeMatch[1]);
                            const end = parseInt(rangeMatch[2]);
                            for (let i = start; i <= end; i++) {
                                weekNumbers.push(i);
                            }
                        } else {
                            // 处理单个周数，如 "14"
                            const singleMatch = weeksText.match(/\d+/);
                            if (singleMatch) {
                                weekNumbers.push(parseInt(singleMatch[0]));
                            }
                        }
                    }
                    
                    // 如果都解析失败，返回默认值
                    if (weekNumbers.length === 0) {
                        weekNumbers.push(1);
                    }
                    
                    return weekNumbers;
                }

                icalContent.push('END:VCALENDAR');
                return icalContent.join('\r\n');
            }

            // 格式化日期时间为iCal格式
            function formatICalDateTime(date, time) {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const [hours, minutes] = time.split(':');
                return `${year}${month}${day}T${hours}${minutes}00`;
            }

            // 生成iCal内容
            const icalContent = generateICalContent(arrangedList, termCode);
            console.log("iCal内容生成完成，长度:", icalContent.length);

            // 下载iCal文件
            const blob = new Blob([icalContent], { type: 'text/calendar;charset=utf-8;' });
            const link = document.createElement("a");
            if (link.download !== undefined) {
                const url = URL.createObjectURL(blob);
                link.setAttribute("href", url);
                link.setAttribute("download", `课程表导出_${getCurrentDateTime()}.ics`);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }

            console.log("iCal导出完成！请检查 .ics 文件。");

        } catch (err) {
            console.error("iCal导出失败:", err);
            alert("iCal导出出错，请查看控制台日志。\n" + err.message);
        }
    }

    // 页面加载完成后添加导出选项
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', addExportOption);
    } else {
        addExportOption();
    }
})();

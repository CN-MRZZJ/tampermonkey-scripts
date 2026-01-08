// ==UserScript==
// @name         BISTU教务系统一键评教
// @namespace    https://github.com/CN-MRZZJ/tampermonkey-scripts
// @version      2.0.0
// @description  在BISTU（北京信息科技大学）教务系统评教页面右侧添加一键评教按钮，自动选中所有评教选项，提升评教效率
// @author       MRZZJ
// @match        https://jwxt.bistu.edu.cn/jwapp/sys/wspjyyapp/*
// @match        https://jwxt.bistu.edu.cn/jwapp/sys/wspjyyapp/*default/index.do*
// @grant        none
// @run-at       document-end
// @unwrap
// @license      MIT
// @homepageURL  https://github.com/CN-MRZZJ/tampermonkey-scripts
// @supportURL   https://github.com/CN-MRZZJ/tampermonkey-scripts/issues
// @updateURL    https://raw.githubusercontent.com/CN-MRZZJ/tampermonkey-scripts/main/bistu-jwxt-auto-evaluate.user.js
// @downloadURL  https://raw.githubusercontent.com/CN-MRZZJ/tampermonkey-scripts/main/bistu-jwxt-auto-evaluate.user.js
// @icon         https://jwxt.bistu.edu.cn/favicon.ico
// ==/UserScript==

(function() {
    'use strict';

    /**
     * 等待页面完全加载
     * @param {Function} callback - 页面加载完成后执行的回调函数
     */
    function waitForPageLoad(callback) {
        if (document.readyState === 'complete') {
            callback();
        } else {
            window.addEventListener('load', callback);
        }
    }

    /**
     * 创建一键评教按钮并绑定点击事件
     */
    function createButton() {
        // 避免重复创建按钮
        if (document.getElementById('onekey-pj-btn')) {
            return;
        }

        // 创建按钮元素
        const btn = document.createElement('button');
        btn.id = 'onekey-pj-btn';
        btn.textContent = '一键评教';
        
        // 按钮样式（强制优先级，避免被页面样式覆盖）
        btn.style.cssText = `
            position: fixed !important;
            right: 20px !important;
            top: 100px !important;
            z-index: 99999 !important;
            padding: 15px 25px !important;
            background-color: #ff4d4f !important;
            color: white !important;
            border: none !important;
            border-radius: 8px !important;
            font-size: 18px !important;
            cursor: pointer !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
            transition: all 0.3s !important;
            opacity: 1 !important;
            display: block !important;
        `;

        // 鼠标悬停/离开样式切换
        btn.addEventListener('mouseover', () => {
            btn.style.backgroundColor = '#ff7875 !important';
        });
        btn.addEventListener('mouseout', () => {
            btn.style.backgroundColor = '#ff4d4f !important';
        });

        // 一键评教核心逻辑
        btn.addEventListener('click', () => {
            try {
                // 获取所有评教单选框组
                const radioGroups = document.querySelectorAll('.bh-radio.bh-radio-group-h');
                
                // 未找到评教选项的提示
                if (radioGroups.length === 0) {
                    alert('⚠️ 未找到评教选项！\n可能原因：\n1. 还未进入具体评教条目\n2. 页面DOM结构已变更');
                    return;
                }

                // 遍历选中所有评教选项
                let successCount = 0;
                radioGroups.forEach(group => {
                    const input = group.querySelector('input[type="radio"]') || (group.childNodes[1]?.querySelector('input'));
                    if (input) {
                        input.checked = true;
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                        successCount++;
                    }
                });

                // 执行成功提示
                alert(`✅ 一键评教完成！\n成功选中 ${successCount} 个评教选项`);
            } catch (error) {
                console.error('一键评教执行出错：', error);
                alert('❌ 评教执行出错！\n请刷新页面重试，或检查浏览器控制台报错信息');
            }
        });

        // 将按钮添加到页面
        document.body.appendChild(btn);
        console.log('✅ 一键评教按钮已成功创建');
    }

    // 页面加载完成后延迟创建按钮（兼容异步加载）
    waitForPageLoad(() => {
        setTimeout(createButton, 1000);
    });

    // 监听路由变化（适配单页应用，重新创建按钮）
    let lastHref = window.location.href;
    setInterval(() => {
        if (window.location.href !== lastHref) {
            lastHref = window.location.href;
            setTimeout(createButton, 500);
        }
    }, 500);

})();

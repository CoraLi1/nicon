/**
 * 字体图标CURD Controller
 *
 */

let responseFormat = require('../util/responseFormat');
let db = require('../database');
let fileUtil = require('../util/fileUtil');
let incUtil = require('../util/incUtil');
let IconController = require('./iconController');
let iconControllerIns = new IconController();
let RepoController = require('./repoController');
let repoControllerIns = new RepoController();
let log = require('../util/log');
let pinyin = require('pinyin');

class IconDraftController {
    /**
     * 获取当前用户的草稿字体图标列表
     *
     * @param    {Object}           ctx                     请求对象
     * @return   {void}
     */
    async getIconDraftList (ctx) {
        let userInfo = ctx.userInfo;
        let query = ctx.request.query || {};
        let result = await db.iconDraft.find({
            ownerId: userInfo.userId
        }, global.globalConfig.iconDraftExportFields,
        {
            limit: parseInt(query.pageSize),
            skip: parseInt((query.pageIndex - 1) * query.pageSize)
        }
        );
        query.totalCount = await db.iconDraft.count({ownerId: userInfo.userId});
        ctx.body = responseFormat.responseFormatList(200, '', result, query);
    }

    /**
     * 上传字体图标
     *
     * @param    {Object}           ctx                     请求对象
     * @return   {void}
     */
    async saveDraftIcon (ctx) {
        let userInfo = ctx.userInfo;
        let fileParams = (ctx.request || {}).files;

        if (!/\.svg$/.exec(fileParams.file.name)) {
            ctx.body = responseFormat.responseFormat(200, '请上传svg格式图片！', false);
            return;
        } else {
            fileParams.file.name = fileParams.file.name.replace('.svg', '')
        }
        // 获取文件内容，再删掉
        let fileContent = await fileUtil.readFile(fileParams.file.path, {encoding: 'utf8'});
        await fileUtil.deleteFile(fileParams.file.path);
        // 对svg进行处理，重新绘制
        let iconInfo = await fileUtil.formatSvgFile(fileContent);
        await this.saveDraftIconToDB(fileParams.file.name, iconInfo, userInfo, ctx);
    }

    async collectIcon (ctx) {
        let userInfo = ctx.userInfo;
        let params = ctx.request.body;

        await this.saveDraftIconToDB(params.iconName, params, userInfo, ctx);
    }

    async saveDraftIconToDB (iconName, iconInfo, userInfo, ctx) {
        // 获取唯一自增Id
        let iconId = await incUtil.getIncId({model: 'iconDraft', field: 'iconId'});
        // 构建完整数据
        let params = {
            iconName: iconName,
            ownerId: userInfo.userId,
            iconContent: iconInfo.iconContent,
            iconOriginContent: iconInfo.iconOriginContent,
            svgPath: iconInfo.svgPath,
            createTime: global.globalConfig.nowTime,
            updateTime: global.globalConfig.nowTime,
            iconId: iconId
        };
        await db.iconDraft.add(params);
        ctx.body = responseFormat.responseFormat(200, '', {
            iconContent: iconInfo.iconContent,
            name: iconName
        });
    }

    /**
     * 删除草稿字体图标
     *
     * @param    {Object}           ctx                     请求对象
     * @return   {void}
     */
    async deleteDraftIcon (ctx) {
        let userInfo = ctx.userInfo;
        let params = ctx.request.body;

        await db.iconDraft.delete({
            iconId: params.iconId,
            ownerId: userInfo.userId
        });
        log.debug(`[%s.deleteDraftIcon] delete iconDraft success--${params.iconId}`, this.constructor.name)
        ctx.body = responseFormat.responseFormat(200, '删除成功！', true);
    }

    /**
     * 删除草稿字体图标
     *
     * @param    {Object}           ctx                     请求对象
     * @return   {void}
     */
    async updateDraftIcon (ctx) {
        let userInfo = ctx.userInfo;
        let params = ctx.request.body;

        await db.iconDraft.update({
            iconId: params.iconId,
            ownerId: userInfo.userId
        }, {
            iconName: params.iconName
        });

        ctx.body = responseFormat.responseFormat(200, '更新成功！', true);
    }

    /**
     * 下载字体图标
     *
     * @param    {Object}           ctx                     请求对象
     * @return   {void}
     */
    async downloadIcon (ctx) {
        let params = ctx.params || {};
        let iconItem = await db.iconDraft.findOne({
            iconId: params.iconId
        });
        if (!iconItem) {
            ctx.body = responseFormat.responseFormat(200, '无此图标！', false);
            return;
        }
        // 强制客户端直接下载svg headers
        ctx.set('Content-Type', 'application/force-download');
        ctx.set('Content-disposition', 'attachment; filename=' + iconItem.iconName + '.svg');
        ctx.body = iconItem.iconContent;
    }

    /**
     * 提交草稿转换成正式字体图标并删除
     *
     * @param    {Object}           ctx                     请求对象
     * @return   {void}
     */
    async changeDraft2Icon (ctx) {
        let userInfo = ctx.userInfo;
        let iconItems = await db.iconDraft.find({
            ownerId: userInfo.userId
        });
        let newIcons = [];
        // 允许名称重复，但名称不可修改
        // for (let i = 0; i < iconItems.length; i++) {
        //     let iconItem = await db.icon.findOne({
        //         iconName: iconItems[i].iconName,
        //         ownerId: userInfo.userId
        //     });
        //     if (iconItem) {
        //         throw new Error(`${iconItems[i].iconName}图标已经存在，请修改名称！`)
        //     }
        // }
        // 验证完成之后再保存
        for (let i = 0; i < iconItems.length; i++) {
            let iconName = this.getName(iconItems[i].iconName);
            if (ctx.request.body.resetColor) {
                let iconInfo = await fileUtil.formatSvgFile(iconItems[i].iconContent);
                iconItems[i].iconContent = iconInfo.iconContent;
            }
            let iconItem = await iconControllerIns.saveIcon(iconName, iconItems[i].iconContent, userInfo);
            newIcons.push(iconItem);
        }
        // 添加到指定图标库中
        if (ctx.request.body.repoId) {
            ctx.request.body.icons = newIcons;
            await repoControllerIns.addIcon2Repo(ctx);
        }
        // 转化完之后删除
        await db.iconDraft.delete({
            ownerId: userInfo.userId
        });
        ctx.body = responseFormat.responseFormat(200, '', true);
    }
    /**
     * 转化中文为拼音
     *
     * @param    {String}           name                    图标名称
     * @return   {void}
     */
    getName (name) {
        return pinyin(name, {
            style: pinyin.STYLE_NORMAL,
            heteronym: true
        }).reduce(function (sum, val) {
            console.log(sum, val);
            return sum + val[0];
        }, '').replace(/\s+|、|&/g, '-');
    }
};

module.exports = IconDraftController;
